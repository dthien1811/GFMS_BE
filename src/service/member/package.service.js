// src/service/member/package.service.js
import db from "../../models";
import payosService from "../payment/payos.service";

function genCode(prefix = "TX") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

const ALLOWED_PAYMENT = new Set(["cash", "momo", "vnpay", "payos"]);

async function getMembersByUserId(userId) {
  return db.Member.findAll({ where: { userId } });
}

async function getMemberByUserIdAndGymId(userId, gymId) {
  return db.Member.findOne({ where: { userId, gymId } });
}

async function ensureMemberForGym({ userId, gymId, transaction }) {
  let member = await getMemberByUserIdAndGymId(userId, gymId);
  if (!member) {
    member = await db.Member.create(
      {
        userId,
        gymId,
        status: "active",
        joinDate: new Date(),
      },
      { transaction }
    );
  }
  return member;
}

function parseGymIdMaybe(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const memberPackageService = {
  // ================= LIST PACKAGES =================
  async listPackages(userId, { gymId } = {}) {
    const wantedGymId = parseGymIdMaybe(gymId);

    if (!wantedGymId) {
      const members = await getMembersByUserId(userId);

      if (members.length === 0) {
        // marketplace: chưa “thuộc” gym nào, bắt buộc FE truyền gymId
        const err = new Error("Bạn chưa chọn gym. Vui lòng truyền gymId để xem gói tập.");
        err.statusCode = 400;
        throw err;
      }

      if (members.length === 1) {
        return db.Package.findAll({
          where: { gymId: members[0].gymId, isActive: true },
          order: [["createdAt", "DESC"]],
        });
      }

      const err = new Error("Bạn đang có nhiều gym. Vui lòng truyền gymId để xem gói tập.");
      err.statusCode = 400;
      throw err;
    }

    // Validate gym tồn tại + active (optional nhưng nên có)
    const gym = await db.Gym.findByPk(wantedGymId, { attributes: ["id", "status"] });
    if (!gym || String(gym.status).toLowerCase() !== "active") {
      const err = new Error("Gym không tồn tại hoặc không hoạt động.");
      err.statusCode = 404;
      throw err;
    }

    return db.Package.findAll({
      where: { gymId: wantedGymId, isActive: true },
      order: [["createdAt", "DESC"]],
    });
  },

  // ================= PURCHASE PACKAGE =================
  async purchasePackage(userId, packageId, payload) {
    const t = await db.sequelize.transaction();
    try {
      // 1) LOAD PACKAGE
      const pkg = await db.Package.findByPk(packageId, { transaction: t });
      if (!pkg || !pkg.isActive) {
        const err = new Error("Gói không tồn tại hoặc chưa được công bố.");
        err.statusCode = 404;
        throw err;
      }

      // 2) ENSURE MEMBER FOR THIS GYM (✅ multi gym)
      const member = await ensureMemberForGym({
        userId,
        gymId: pkg.gymId,
        transaction: t,
      });

      // 3) VALIDATE PAYMENT METHOD
      const paymentMethod = String(payload?.paymentMethod || "cash").toLowerCase();
      if (!ALLOWED_PAYMENT.has(paymentMethod)) {
        const err = new Error("paymentMethod không hợp lệ. Hỗ trợ: cash / momo / vnpay / payos.");
        err.statusCode = 400;
        throw err;
      }

      const trainerId = payload?.trainerId || null;

      // 4) PAYOS FLOW
      if (paymentMethod === "payos") {
        const tx = await db.Transaction.create(
          {
            transactionCode: genCode("PKG"),
            memberId: member.id,
            trainerId,
            gymId: pkg.gymId,
            packageId: pkg.id,
            amount: pkg.price,
            transactionType: "package_purchase",
            paymentMethod,
            paymentStatus: "pending",
            description: `Thanh toán gói (PayOS): ${pkg.name}`,
            processedBy: userId,
          },
          { transaction: t }
        );

        const payosResp = await payosService.createPackagePaymentLink({
          orderCode: tx.id,
          amount: pkg.price,
          description: `Thanh toán gói ${pkg.name} cho member #${member.id}`,
        });

        await tx.update(
          {
            metadata: {
              ...(tx.metadata || {}),
              payos: {
                orderCode: payosResp.orderCode,
                checkoutUrl: payosResp.checkoutUrl,
                paymentLinkId: payosResp.paymentLinkId,
              },
            },
          },
          { transaction: t }
        );

        await t.commit();
        return {
          transaction: tx,
          paymentProvider: "payos",
          paymentUrl: payosResp.checkoutUrl,
        };
      }

      // 5) OTHER PAYMENT (PAID NGAY)
      const tx = await db.Transaction.create(
        {
          transactionCode: genCode("PKG"),
          memberId: member.id,
          trainerId,
          gymId: pkg.gymId,
          packageId: pkg.id,
          amount: pkg.price,
          transactionType: "package_purchase",
          paymentMethod,
          paymentStatus: "completed",
          description: `Mua gói: ${pkg.name}`,
          transactionDate: new Date(),
          processedBy: userId,
        },
        { transaction: t }
      );

      let expiryDate = null;
      if (pkg.durationDays && pkg.durationDays > 0) {
        expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + pkg.durationDays);
      }

      const activation = await db.PackageActivation.create(
        {
          memberId: member.id,
          packageId: pkg.id,
          transactionId: tx.id,
          activationDate: new Date(),
          expiryDate,
          totalSessions: pkg.sessions,
          sessionsUsed: 0,
          sessionsRemaining: pkg.sessions,
          pricePerSession: pkg.sessions ? pkg.price / pkg.sessions : null,
          status: "active",
        },
        { transaction: t }
      );

      await tx.update({ packageActivationId: activation.id }, { transaction: t });

      await t.commit();
      return { transaction: tx, activation };
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};

export default memberPackageService;
