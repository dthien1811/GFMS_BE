require("dotenv").config();
const db = require("../src/models");
const { Op } = require("sequelize");

const PAID_STATUSES = new Set(["PAID", "SUCCESS", "SUCCEEDED"]);
const APPLY = process.argv.includes("--apply");

function parseMeta(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function pickPayosStatus(meta = {}) {
  const candidates = [
    meta?.payosWebhook?.status,
    meta?.payosConfirm?.status,
    meta?.payos?.status,
    meta?.status,
  ];
  for (const item of candidates) {
    const v = String(item || "").trim();
    if (v) return v.toUpperCase();
  }
  return "";
}

function pickAmountPaid(meta = {}) {
  const candidates = [
    meta?.payosWebhook?.amountPaid,
    meta?.payosConfirm?.amountPaid,
    meta?.payos?.amountPaid,
  ];
  for (const item of candidates) {
    const n = Number(item || 0);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function isCancelledOrFailed(status) {
  const s = String(status || "").toUpperCase();
  return s.includes("CANCEL") || s.includes("FAIL") || s.includes("EXPIRE");
}

function isActuallyPaid({ status, amountPaid, amount }) {
  const normalized = String(status || "").toUpperCase();
  const paid = Number(amountPaid || 0);
  const total = Number(amount || 0);
  return PAID_STATUSES.has(normalized) || (total > 0 && paid >= total);
}

async function findAnomalies() {
  const activationRows = await db.PackageActivation.findAll({
    attributes: ["transactionId"],
    where: {
      transactionId: { [Op.ne]: null },
    },
    raw: true,
  });
  const activationTxIds = [
    ...new Set(
      activationRows
        .map((x) => Number(x.transactionId || 0))
        .filter(Boolean)
    ),
  ];

  const txs = await db.Transaction.findAll({
    where: {
      transactionType: "package_purchase",
      paymentMethod: "payos",
      [Op.or]: [
        { packageActivationId: { [Op.ne]: null } },
        ...(activationTxIds.length ? [{ id: { [Op.in]: activationTxIds } }] : []),
      ],
    },
    attributes: [
      "id",
      "memberId",
      "packageId",
      "gymId",
      "amount",
      "paymentStatus",
      "packageActivationId",
      "transactionDate",
      "metadata",
      "createdAt",
    ],
    order: [["id", "DESC"]],
  });

  const anomalies = [];
  for (const tx of txs) {
    const meta = parseMeta(tx.metadata);
    const payosStatus = pickPayosStatus(meta);
    const amountPaid = pickAmountPaid(meta);
    const amount = Number(tx.amount || 0);
    const txPaymentStatus = String(tx.paymentStatus || "").toLowerCase();

    const paid = isActuallyPaid({ status: payosStatus, amountPaid, amount });
    const suspicious =
      txPaymentStatus !== "completed" ||
      isCancelledOrFailed(payosStatus) ||
      (!paid && (payosStatus || "").length > 0 && amountPaid <= 0);

    if (!suspicious) continue;

    anomalies.push({
      txId: Number(tx.id),
      activationId: tx.packageActivationId ? Number(tx.packageActivationId) : null,
      memberId: Number(tx.memberId || 0),
      packageId: Number(tx.packageId || 0),
      payosStatus,
      amount,
      amountPaid,
    });
  }
  return anomalies;
}

async function repairOne(txId) {
  const t = await db.sequelize.transaction();
  try {
    const tx = await db.Transaction.findByPk(txId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!tx) {
      await t.rollback();
      return { txId, skipped: "transaction_not_found" };
    }

    const activation =
      (tx.packageActivationId
        ? await db.PackageActivation.findByPk(tx.packageActivationId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
          })
        : null) ||
      (await db.PackageActivation.findOne({
        where: { transactionId: tx.id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      }));

    const result = {
      txId: Number(tx.id),
      activationId: activation ? Number(activation.id) : null,
      bookingsCancelled: 0,
      bookingsDeleted: 0,
      attendancesDeleted: 0,
      commissionsDeleted: 0,
      activationDeleted: false,
      txReset: false,
    };

    if (activation) {
      const bookings = await db.Booking.findAll({
        where: {
          packageActivationId: activation.id,
          status: { [Op.ne]: "cancelled" },
        },
        attributes: ["id", "status"],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      const bookingIds = bookings.map((b) => Number(b.id)).filter(Boolean);
      if (bookingIds.length) {
        const [updatedCount] = await db.Booking.update(
          {
            status: "cancelled",
            checkoutTime: null,
          },
          {
            where: { id: bookingIds },
            transaction: t,
          }
        );
        result.bookingsCancelled = Number(updatedCount || 0);

        if (db.Attendance) {
          result.attendancesDeleted = await db.Attendance.destroy({
            where: { bookingId: bookingIds },
            transaction: t,
          });
        }

        if (db.Commission) {
          result.commissionsDeleted = await db.Commission.destroy({
            where: { bookingId: bookingIds },
            transaction: t,
          });
        }

        if (db.BookingRescheduleRequest) {
          await db.BookingRescheduleRequest.destroy({
            where: { bookingId: bookingIds },
            transaction: t,
          });
        }

        result.bookingsDeleted = await db.Booking.destroy({
          where: { id: bookingIds },
          transaction: t,
        });
      }

      await db.Transaction.update(
        { packageActivationId: null },
        {
          where: { packageActivationId: activation.id },
          transaction: t,
        }
      );

      await db.PackageActivation.destroy({
        where: { id: activation.id },
        transaction: t,
      });
      result.activationDeleted = true;
    }

    await tx.update(
      {
        paymentStatus: "cancelled",
        packageActivationId: null,
        transactionDate: null,
        metadata: {
          ...(parseMeta(tx.metadata) || {}),
          repair: {
            type: "payos_cancelled_activation_cleanup",
            repairedAt: new Date().toISOString(),
          },
        },
      },
      { transaction: t, silent: false }
    );
    result.txReset = true;

    await t.commit();
    return result;
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

async function main() {
  try {
    console.log("=== Scan giao dịch PayOS bị kích hoạt nhầm ===");
    console.log(`Mode: ${APPLY ? "APPLY (sẽ ghi DB)" : "DRY RUN (không ghi DB)"}`);

    const anomalies = await findAnomalies();
    if (!anomalies.length) {
      console.log("Khong tim thay du lieu bat thuong.");
      await db.sequelize.close();
      return;
    }

    console.log(`Tim thay ${anomalies.length} giao dich nghi ngo:`);
    anomalies.forEach((x) => {
      console.log(
        `- tx#${x.txId} | activation#${x.activationId || "-"} | payosStatus=${x.payosStatus || "N/A"} | amountPaid=${x.amountPaid}/${x.amount}`
      );
    });

    if (!APPLY) {
      console.log("\nChay lai voi --apply de thuc hien rollback.");
      await db.sequelize.close();
      return;
    }

    console.log("\n=== Bat dau rollback ===");
    let fixed = 0;
    for (const item of anomalies) {
      const rs = await repairOne(item.txId);
      fixed += rs.txReset ? 1 : 0;
      console.log(
        `tx#${rs.txId}: txReset=${rs.txReset} activationDeleted=${rs.activationDeleted} bookingsCancelled=${rs.bookingsCancelled} attendancesDeleted=${rs.attendancesDeleted} commissionsDeleted=${rs.commissionsDeleted}`
      );
    }

    console.log(`\nHoan tat. Da rollback ${fixed}/${anomalies.length} giao dich.`);
  } catch (error) {
    console.error("Script loi:", error?.message || error);
    if (error?.original?.sqlMessage) {
      console.error("MySQL:", error.original.sqlMessage);
    }
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
}

main();
