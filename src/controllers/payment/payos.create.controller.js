import db from "../../models";
import payosService from "../../service/payment/payos.service";

const payosCreateController = {
  async create(req, res) {
    const t = await db.sequelize.transaction();
    try {
      const userId = req.user?.id;        // ✅ userId
      const { packageId } = req.body;

      if (!userId || !packageId) {
        return res.status(400).json({ message: "Thiếu userId hoặc packageId" });
      }

      /* =========================
         1️⃣ LOAD PACKAGE
      ========================= */
      const pkg = await db.Package.findByPk(packageId, { transaction: t });
      if (!pkg || !pkg.isActive) {
        await t.rollback();
        return res.status(404).json({ message: "Gói không tồn tại hoặc không khả dụng" });
      }

      /* =========================
         2️⃣ LOAD / AUTO-CREATE MEMBER
      ========================= */
      let member = await db.Member.findOne({
        where: { userId },
        transaction: t,
      });

      if (!member) {
        member = await db.Member.create(
          {
            userId,
            gymId: pkg.gymId,
            status: "active",
            joinDate: new Date(),
          },
          { transaction: t }
        );
      }

      /* =========================
         3️⃣ CREATE TRANSACTION (ĐÚNG FK)
      ========================= */
      const tx = await db.Transaction.create(
        {
          memberId: member.id,              // ✅ QUAN TRỌNG
          packageId: pkg.id,
          gymId: pkg.gymId,
          amount: pkg.price,
          transactionType: "package_purchase",
          paymentMethod: "payos",
          paymentStatus: "pending",
          description: `Thanh toán PayOS - ${pkg.name}`,
          transactionCode: `PAYOS-${Date.now()}`,
          processedBy: userId,              // ✅ user.id
        },
        { transaction: t }
      );

      /* =========================
         4️⃣ CREATE PAYOS LINK
      ========================= */
      const { checkoutUrl, orderCode, paymentLinkId } = await payosService.createPackagePaymentLink({
        orderCode: tx.id, // ✅ dùng transaction.id
        amount: pkg.price,
        description: `Thanh toán ${pkg.name}`,
      });

      await tx.update(
        {
          metadata: {
            ...(tx.metadata || {}),
            payos: {
              orderCode,
              checkoutUrl,
              paymentLinkId,
            },
          },
        },
        { transaction: t }
      );

      await t.commit();
      return res.status(200).json({
        message: "Tạo link thanh toán thành công",
        checkoutUrl,
        transactionId: tx.id,
      });
    } catch (e) {
      await t.rollback();
      console.error("[payOS create] error:", e);
      return res.status(500).json({ message: e.message });
    }
  },
};

export default payosCreateController;
