import db from "../../models";
import { Op } from "sequelize";
import ExcelJS from "exceljs";

const { Withdrawal, Trainer, User, Gym, sequelize } = db;

const parsePaging = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const ensureOwnerGymIds = async (ownerUserId) => {
  const gyms = await Gym.findAll({
    where: { ownerId: ownerUserId },
    attributes: ["id"],
    raw: true,
  });
  return gyms.map((g) => g.id);
};

const mergeOwnerApprovalNote = (existingNotes, ownerNote) => {
  const o = String(ownerNote || "").trim();
  const e = String(existingNotes || "").trim();
  if (!o) return e || null;
  if (!e) return o;
  return `${e}\n\n${o}`;
};

const ownerWithdrawalService = {
  async getWithdrawals(ownerUserId, query = {}) {
    const { page, limit, offset } = parsePaging(query);
    const { status, gymId } = query;

    const ownerGymIds = await ensureOwnerGymIds(ownerUserId);
    const scopedGymId = Number.isInteger(Number(gymId)) && Number(gymId) > 0 ? Number(gymId) : null;
    const gymIds = scopedGymId && ownerGymIds.includes(scopedGymId) ? [scopedGymId] : ownerGymIds;
    if (gymIds.length === 0) {
      return { data: [], pagination: { total: 0, page, limit, totalPages: 0 } };
    }

    const where = {};
    if (status) where.status = status;

    const { rows, count } = await Withdrawal.findAndCountAll({
      where,
      include: [
        {
          model: Trainer,
          required: true,
          attributes: ["id", "gymId"],
          where: { gymId: { [Op.in]: gymIds } },
          include: [{ model: User, attributes: ["id", "username", "email", "phone"], required: false }],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return {
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  },

  async exportWithdrawals(ownerUserId, query = {}) {
    const { status, gymId } = query;
    const ownerGymIds = await ensureOwnerGymIds(ownerUserId);
    const scopedGymId = Number.isInteger(Number(gymId)) && Number(gymId) > 0 ? Number(gymId) : null;
    const gymIds = scopedGymId && ownerGymIds.includes(scopedGymId) ? [scopedGymId] : ownerGymIds;
    if (gymIds.length === 0) {
      return { buffer: Buffer.from(""), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: "withdrawals.xlsx" };
    }

    const where = {};
    if (status) where.status = status;

    const rows = await Withdrawal.findAll({
      where,
      include: [
        {
          model: Trainer,
          required: true,
          attributes: ["id", "gymId"],
          where: { gymId: { [Op.in]: gymIds } },
          include: [{ model: User, attributes: ["id", "username", "email", "phone"], required: false }],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Withdrawals");
    sheet.columns = [
      { header: "PT", key: "trainer", width: 20 },
      { header: "Email", key: "email", width: 24 },
      { header: "So tien", key: "amount", width: 14 },
      { header: "Phuong thuc", key: "method", width: 14 },
      { header: "Tai khoan", key: "account", width: 32 },
      { header: "Trang thai", key: "status", width: 12 },
      { header: "Ngay yeu cau", key: "createdAt", width: 16 },
    ];

    rows.forEach((w) => {
      let account = {};
      try {
        account = w.accountInfo ? JSON.parse(w.accountInfo) : {};
      } catch {
        account = {};
      }
      sheet.addRow({
        trainer: w.Trainer?.User?.username || "N/A",
        email: w.Trainer?.User?.email || "N/A",
        amount: Number(w.amount || 0),
        method: w.withdrawalMethod || "N/A",
        account:
          w.withdrawalMethod === "bank_transfer"
            ? `${account.bankName || ""} ${account.accountNumber || ""} ${account.accountHolder || ""}`.trim()
            : w.withdrawalMethod || "N/A",
        status: w.status || "pending",
        createdAt: w.createdAt ? new Date(w.createdAt).toLocaleDateString("vi-VN") : "N/A",
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return { buffer, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: "withdrawals.xlsx" };
  },

  async approveWithdrawal(ownerUserId, id, ownerNote = "") {
    const gymIds = await ensureOwnerGymIds(ownerUserId);
    const withdrawal = await Withdrawal.findByPk(id, {
      include: [{ model: Trainer, attributes: ["id", "gymId", "pendingCommission"] }],
    });
    if (!withdrawal || !withdrawal.Trainer || !gymIds.includes(withdrawal.Trainer.gymId)) {
      const err = new Error("Không tìm thấy yêu cầu hoặc bạn không có quyền.");
      err.statusCode = 404;
      throw err;
    }
    if (withdrawal.status === "completed") {
      const err = new Error("Yêu cầu đã được chi trả.");
      err.statusCode = 400;
      throw err;
    }
    if (withdrawal.status !== "pending") {
      const err = new Error("Yêu cầu không ở trạng thái chờ duyệt.");
      err.statusCode = 400;
      throw err;
    }

    const amount = Number(withdrawal.amount || 0);
    const held = Boolean(withdrawal.balanceHeld);

    if (!held) {
      const pending = Number(withdrawal.Trainer.pendingCommission || 0);
      if (amount > pending) {
        const err = new Error("Số tiền vượt quá hoa hồng đang chờ.");
        err.statusCode = 400;
        throw err;
      }
    }

    const updatePayload = {
      status: "completed",
      processedBy: ownerUserId,
      processedDate: new Date(),
    };
    const mergedNotes = mergeOwnerApprovalNote(withdrawal.notes, ownerNote);
    if (mergedNotes != null) {
      updatePayload.notes = mergedNotes;
    }
    await withdrawal.update(updatePayload);

    if (!held) {
      const pending = Number(withdrawal.Trainer.pendingCommission || 0);
      await withdrawal.Trainer.update({
        pendingCommission: Math.max(0, pending - amount),
        lastPayoutDate: new Date(),
      });
    } else {
      await withdrawal.Trainer.update({
        lastPayoutDate: new Date(),
      });
    }

    return withdrawal;
  },

  async autoApprovePendingWithdrawals(ownerUserId, payload = {}) {
    const { gymId, notes = "" } = payload || {};
    const ownerGymIds = await ensureOwnerGymIds(ownerUserId);
    const scopedGymId = Number.isInteger(Number(gymId)) && Number(gymId) > 0 ? Number(gymId) : null;
    const gymIds = scopedGymId && ownerGymIds.includes(scopedGymId) ? [scopedGymId] : ownerGymIds;
    if (gymIds.length === 0) {
      return { approvedCount: 0, skippedCount: 0, processed: [] };
    }

    const pendingRows = await Withdrawal.findAll({
      where: { status: "pending" },
      include: [
        {
          model: Trainer,
          required: true,
          attributes: ["id", "gymId"],
          where: { gymId: { [Op.in]: gymIds } },
        },
      ],
      order: [["createdAt", "ASC"]],
      attributes: ["id"],
    });

    const processed = [];
    let skippedCount = 0;

    for (const row of pendingRows) {
      try {
        const updated = await sequelize.transaction(async (t) => {
          const withdrawal = await Withdrawal.findByPk(row.id, {
            transaction: t,
            lock: t.LOCK.UPDATE,
            include: [{ model: Trainer, attributes: ["id", "gymId", "pendingCommission"] }],
          });
          if (!withdrawal || !withdrawal.Trainer || !gymIds.includes(withdrawal.Trainer.gymId)) return null;
          if (withdrawal.status !== "pending") return null;

          const amount = Number(withdrawal.amount || 0);
          const held = Boolean(withdrawal.balanceHeld);
          if (!held) {
            const pending = Number(withdrawal.Trainer.pendingCommission || 0);
            if (amount > pending) return null;
          }

          const updatePayload = {
            status: "completed",
            processedBy: ownerUserId,
            processedDate: new Date(),
          };
          const mergedNotes = mergeOwnerApprovalNote(withdrawal.notes, notes);
          if (mergedNotes != null) {
            updatePayload.notes = mergedNotes;
          }
          await withdrawal.update(updatePayload, { transaction: t });

          if (!held) {
            const pending = Number(withdrawal.Trainer.pendingCommission || 0);
            await withdrawal.Trainer.update(
              {
                pendingCommission: Math.max(0, pending - amount),
                lastPayoutDate: new Date(),
              },
              { transaction: t }
            );
          } else {
            await withdrawal.Trainer.update(
              {
                lastPayoutDate: new Date(),
              },
              { transaction: t }
            );
          }

          return { id: withdrawal.id, status: withdrawal.status, trainerId: withdrawal.Trainer.id };
        });

        if (updated) {
          processed.push(updated);
        } else {
          skippedCount += 1;
        }
      } catch {
        skippedCount += 1;
      }
    }

    return {
      approvedCount: processed.length,
      skippedCount,
      processed,
    };
  },

  async rejectWithdrawal(ownerUserId, id, reason = "") {
    const gymIds = await ensureOwnerGymIds(ownerUserId);
    return sequelize.transaction(async (t) => {
      const withdrawal = await Withdrawal.findByPk(id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
        include: [{ model: Trainer, attributes: ["id", "gymId", "pendingCommission"] }],
      });
      if (!withdrawal || !withdrawal.Trainer || !gymIds.includes(withdrawal.Trainer.gymId)) {
        const err = new Error("Không tìm thấy yêu cầu hoặc bạn không có quyền.");
        err.statusCode = 404;
        throw err;
      }
      if (withdrawal.status === "completed") {
        const err = new Error("Yêu cầu đã được chi trả.");
        err.statusCode = 400;
        throw err;
      }
      if (withdrawal.status !== "pending") {
        const err = new Error("Yêu cầu không ở trạng thái chờ duyệt.");
        err.statusCode = 400;
        throw err;
      }

      const amount = Number(withdrawal.amount || 0);
      if (withdrawal.balanceHeld) {
        const tr = await Trainer.findByPk(withdrawal.Trainer.id, {
          transaction: t,
          lock: t.LOCK.UPDATE,
          attributes: ["id", "pendingCommission"],
        });
        const pending = Number(tr?.pendingCommission || 0);
        await tr.update({ pendingCommission: pending + amount }, { transaction: t });
      }

      await withdrawal.update(
        {
          status: "rejected",
          processedBy: ownerUserId,
          processedDate: new Date(),
          notes: reason || withdrawal.notes,
        },
        { transaction: t }
      );

      return withdrawal;
    });
  },
};

export default ownerWithdrawalService;
