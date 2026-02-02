import db from "../../models";
import payosService from "../payment/payos.service";

function genCode(prefix = "TX") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function getMemberByUserId(userId) {
  return db.Member.findOne({ where: { userId } });
}

const ALLOWED_PAYMENT = new Set(["cash", "momo", "vnpay", "payos"]);

const memberPackageService = {
  // ================= LIST PACKAGES =================
  async listPackages(userId) {
    const member = await getMemberByUserId(userId);
    if (!member) {
      const err = new Error("Không tìm thấy Member.");
      err.statusCode = 404;
      throw err;
    }

    return db.Package.findAll({
      where: { gymId: member.gymId, isActive: true },
      order: [["createdAt", "DESC"]],
    });
  },

  // ================= PURCHASE PACKAGE =================
  async purchasePackage(userId, packageId, payload) {
    const t = await db.sequelize.transaction();
    try {
      /* =================================================
         1️⃣ LOAD PACKAGE TRƯỚC (CỰC KỲ QUAN TRỌNG)
      ================================================= */
      const pkg = await db.Package.findByPk(packageId, { transaction: t });
      if (!pkg || !pkg.isActive) {
        const err = new Error("Gói không tồn tại hoặc chưa được công bố.");
        err.statusCode = 404;
        throw err;
      }

      /* =================================================
         2️⃣ LOAD / AUTO-CREATE MEMBER SAU KHI CÓ pkg
      ================================================= */
      let member = await getMemberByUserId(userId);
      if (!member) {
        member = await db.Member.create(
          {
            userId,
            gymId: pkg.gymId, // ✅ pkg đã tồn tại
            status: "active",
            joinDate: new Date(),
          },
          { transaction: t }
        );
      }

      /* =================================================
         3️⃣ CHECK GYM
      ================================================= */
      if (pkg.gymId !== member.gymId) {
        const err = new Error("Bạn không thể mua gói của gym khác.");
        err.statusCode = 403;
        throw err;
      }

      /* =================================================
         4️⃣ VALIDATE PAYMENT METHOD
      ================================================= */
      const paymentMethod = String(payload?.paymentMethod || "cash").toLowerCase();
      if (!ALLOWED_PAYMENT.has(paymentMethod)) {
        const err = new Error(
          "paymentMethod không hợp lệ. Hỗ trợ: cash / momo / vnpay / payos."
        );
        err.statusCode = 400;
        throw err;
      }

      const trainerId = payload?.trainerId || null;

      /* =================================================
         5️⃣ PAYOS FLOW
      ================================================= */
      if (paymentMethod === "payos") {
        const tx = await db.Transaction.create(
          {
            transactionCode: genCode("PKG"),
            memberId: member.id,          // ✅ member.id
            trainerId,
            gymId: member.gymId,
            packageId: pkg.id,
            amount: pkg.price,
            transactionType: "package_purchase",
            paymentMethod,
          paymentStatus: "pending",
            description: `Thanh toán gói (PayOS): ${pkg.name}`,
            processedBy: userId,          // ✅ user.id
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

      /* =================================================
         6️⃣ OTHER PAYMENT (PAID NGAY)
      ================================================= */
      const tx = await db.Transaction.create(
        {
          transactionCode: genCode("PKG"),
          memberId: member.id,            // ✅ member.id
          trainerId,
          gymId: member.gymId,
          packageId: pkg.id,
          amount: pkg.price,
          transactionType: "package_purchase",
          paymentMethod,
          paymentStatus: "completed",
          description: `Mua gói: ${pkg.name}`,
          transactionDate: new Date(),
          processedBy: userId,            // ✅ user.id
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
          status: "active", // OPTION A
        },
        { transaction: t }
      );

      await tx.update(
        { packageActivationId: activation.id },
        { transaction: t }
      );

      await t.commit();
      return { transaction: tx, activation };
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};

export default memberPackageService;
