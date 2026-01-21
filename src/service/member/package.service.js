import db from "../../models";
import { Op } from "sequelize";
import payosService from "../payment/payos.service";

function genCode(prefix = "TX") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function getMemberByUserId(userId) {
  return db.Member.findOne({ where: { userId } });
}

async function getActiveActivation(memberId) {
  return db.PackageActivation.findOne({
    where: {
      memberId,
      status: "active",
      sessionsRemaining: { [Op.gt]: 0 },
      [Op.or]: [{ expiryDate: null }, { expiryDate: { [Op.gte]: new Date() } }],
    },
    order: [["createdAt", "DESC"]],
  });
}

const ALLOWED_PAYMENT = new Set(["cash", "momo", "vnpay", "payos"]);

const memberPackageService = {
  async listPackages(userId) {
    const member = await getMemberByUserId(userId);
    if (!member) {
      const err = new Error("Không tìm thấy Member.");
      err.statusCode = 404;
      throw err;
    }

    // ✅ chỉ trả gói thuộc gym của member
    return db.Package.findAll({
      where: { gymId: member.gymId, isActive: true },
      order: [["createdAt", "DESC"]],
    });
  },

  async purchasePackage(userId, packageId, payload) {
    const t = await db.sequelize.transaction();
    try {
      const member = await getMemberByUserId(userId);
      if (!member) {
        const err = new Error("Không tìm thấy Member.");
        err.statusCode = 404;
        throw err;
      }

      const pkg = await db.Package.findByPk(packageId, { transaction: t });
      if (!pkg || !pkg.isActive) {
        const err = new Error("Gói không tồn tại hoặc chưa được công bố.");
        err.statusCode = 404;
        throw err;
      }

      if (pkg.gymId !== member.gymId) {
        const err = new Error("Bạn không thể mua gói của gym khác.");
        err.statusCode = 403;
        throw err;
      }

      // ✅ nghiệp vụ hiện tại: chặn mua nếu đang có gói active
      const existing = await getActiveActivation(member.id);
      if (existing) {
        const err = new Error("Bạn đang có gói tập active. Vui lòng dùng hết trước khi mua mới.");
        err.statusCode = 400;
        throw err;
      }

      // ✅ validate payment method (MVP)
      const paymentMethod = String(payload?.paymentMethod || "cash").toLowerCase();
      if (!ALLOWED_PAYMENT.has(paymentMethod)) {
        const err = new Error(
          "paymentMethod không hợp lệ. Hỗ trợ: cash / momo / vnpay / payos (MVP)."
        );
        err.statusCode = 400;
        throw err;
      }

      const trainerId = payload?.trainerId || null;

      // Nhánh thanh toán qua payOS: tạo Transaction pending + tạo link thanh toán
      if (paymentMethod === "payos") {
        const tx = await db.Transaction.create(
          {
            transactionCode: genCode("PKG"),
            memberId: member.id,
            trainerId,
            gymId: member.gymId,
            packageId: pkg.id,
            amount: pkg.price,
            transactionType: "package_purchase",
            paymentMethod,
            paymentStatus: "pending",
            description: `Thanh toán gói (payOS): ${pkg.name}`,
            processedBy: userId,
          },
          { transaction: t }
        );

        // Dùng id giao dịch làm orderCode để webhook tra ngược
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

      // ✅ Transaction: các phương thức khác coi như paid ngay
      const tx = await db.Transaction.create(
        {
          transactionCode: genCode("PKG"),
          memberId: member.id,
          trainerId,
          gymId: member.gymId,
          packageId: pkg.id,
          amount: pkg.price,
          transactionType: "package_purchase",
          paymentMethod,
          paymentStatus: "paid",
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
