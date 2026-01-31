import db from "../../models";
import payosService from "../../service/payment/payos.service";

const payosController = {
  // Webhook payOS gọi về khi thanh toán thay đổi trạng thái
  async webhook(req, res) {
    try {
      const verified = payosService.verifyWebhook(req.body || {});
      const data = verified.data || verified;

      const orderCode = data.orderCode;
      const amount = Number(data.amount || 0);
      const status = data.status || data.paymentStatus || "";

      if (!orderCode) {
        return res.status(400).json({ message: "orderCode không hợp lệ" });
      }

      // Hiện tại ta dùng transaction.id làm orderCode khi tạo link
      const tx = await db.Transaction.findByPk(orderCode);
      if (!tx) {
        return res.status(404).json({ message: "Không tìm thấy giao dịch" });
      }

      // Nếu đã paid thì idempotent
      if (tx.paymentStatus === "paid") {
        return res.status(200).json({ message: "OK (đã xử lý trước đó)" });
      }

      // Chỉ xử lý khi trạng thái thành công
      const normalized = String(status).toUpperCase();
      if (normalized !== "PAID" && normalized !== "SUCCESS" && normalized !== "SUCCEEDED") {
        // Có thể log thêm trạng thái khác nếu cần
        await tx.update(
          {
            paymentStatus: normalized.toLowerCase(),
            metadata: {
              ...(tx.metadata || {}),
              payosWebhook: data,
            },
          },
          { silent: false }
        );
        return res.status(200).json({ message: "Trạng thái không phải PAID – đã lưu log." });
      }

      const member = await db.Member.findByPk(tx.memberId);
      const pkg = await db.Package.findByPk(tx.packageId);

      if (!member || !pkg) {
        return res
          .status(400)
          .json({ message: "Thiếu member hoặc package cho giao dịch này. Không thể kích hoạt gói." });
      }

      // Kiểm tra loại giao dịch
      const isRenewal = tx.transactionType === 'package_renewal';
      
      // Tính expiryDate
      let expiryDate = null;
      let activationDate = new Date();
      
      if (isRenewal) {
        // Nếu là gia hạn, tìm gói activation cũ
        const oldActivation = await db.PackageActivation.findOne({
          where: { 
            memberId: member.id,
            packageId: pkg.id,
          },
          order: [['createdAt', 'DESC']],
        });

        // Nếu gói cũ còn hiệu lực, cộng dồn thời gian
        const now = new Date();
        if (oldActivation && oldActivation.status === 'active' && new Date(oldActivation.expiryDate) > now) {
          expiryDate = new Date(oldActivation.expiryDate);
          expiryDate.setDate(expiryDate.getDate() + pkg.durationDays);
          
          // Đánh dấu gói cũ là completed
          await oldActivation.update({ status: 'completed' });
        } else {
          // Nếu gói đã hết hạn, tính từ hôm nay
          expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + pkg.durationDays);
        }
      } else {
        // Mua mới - tính từ hôm nay
        if (pkg.durationDays && pkg.durationDays > 0) {
          expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + pkg.durationDays);
        }
      }

      const activation = await db.PackageActivation.create({
        memberId: member.id,
        packageId: pkg.id,
        transactionId: tx.id,
        activationDate,
        expiryDate,
        totalSessions: pkg.sessions,
        sessionsUsed: 0,
        sessionsRemaining: pkg.sessions,
        pricePerSession: pkg.sessions ? pkg.price / pkg.sessions : null,
        status: "active",
        notes: isRenewal ? 'Gia hạn gói qua PayOS' : 'Kích hoạt gói qua PayOS',
      });

      await tx.update(
        {
          paymentStatus: "paid",
          transactionDate: new Date(),
          packageActivationId: activation.id,
          amount: amount || tx.amount,
          metadata: {
            ...(tx.metadata || {}),
            payosWebhook: data,
          },
        },
        { silent: false }
      );

      return res.status(200).json({ message: "OK", activationId: activation.id });
    } catch (e) {
      console.error("[payOS webhook] error:", e);
      return res.status(500).json({ message: "Webhook xử lý lỗi", detail: e.message });
    }
  },
};

export default payosController;

