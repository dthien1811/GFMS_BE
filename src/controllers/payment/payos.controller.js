import db from "../../models";
import payosService from "../../service/payment/payos.service";

const PAID_STATUSES = new Set(["PAID", "SUCCESS", "SUCCEEDED"]);

async function activatePackageFromTransaction(tx, amount, metaKey, metaValue) {
  if (tx.packageActivationId) {
    await tx.update(
      {
        paymentStatus: "paid",
        transactionDate: new Date(),
        amount: amount || tx.amount,
        metadata: {
          ...(tx.metadata || {}),
          [metaKey]: metaValue,
        },
      },
      { silent: false }
    );
    return { id: tx.packageActivationId };
  }

  const member = await db.Member.findByPk(tx.memberId);
  const pkg = await db.Package.findByPk(tx.packageId);

  if (!member || !pkg) {
    const err = new Error("Thiếu member hoặc package cho giao dịch này. Không thể kích hoạt gói.");
    err.statusCode = 400;
    throw err;
  }

  let expiryDate = null;
  if (pkg.durationDays && pkg.durationDays > 0) {
    expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + pkg.durationDays);
  }

  const activation = await db.PackageActivation.create({
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
  });

  await tx.update(
    {
      paymentStatus: "paid",
      transactionDate: new Date(),
      packageActivationId: activation.id,
      amount: amount || tx.amount,
      metadata: {
        ...(tx.metadata || {}),
        [metaKey]: metaValue,
      },
    },
    { silent: false }
  );

  return activation;
}

const payosController = {
  // Webhook payOS gọi về khi thanh toán thay đổi trạng thái
  async webhook(req, res) {
    try {
      const rawBody = req.body || {};
      console.log("[payOS webhook] received:", JSON.stringify(rawBody));
      const verified = payosService.verifyWebhook(rawBody);
      const data = verified?.data || rawBody?.data || verified || rawBody;

      const orderCode = data.orderCode || rawBody?.data?.orderCode;
      const amount = Number(data.amount || rawBody?.data?.amount || 0);
      const status = data.status || data.paymentStatus || "";
      const success =
        data.success === true ||
        data.code === "00" ||
        rawBody?.success === true ||
        rawBody?.code === "00" ||
        (verified?.success === true) ||
        (verified?.code === "00");

      if (!orderCode) {
        // PayOS có thể gửi request xác thực webhook không kèm orderCode
        return res.status(200).json({ message: "OK (no orderCode)" });
      }
      console.log("[payOS webhook] orderCode:", orderCode);

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
      const isPaid =
        PAID_STATUSES.has(normalized) ||
        success;
      console.log("[payOS webhook] normalized:", normalized, "isPaid:", isPaid, "success:", success);

      if (!isPaid) {
        // Có thể log thêm trạng thái khác nếu cần
        await tx.update(
          {
            paymentStatus: normalized ? normalized.toLowerCase() : "pending",
            metadata: {
              ...(tx.metadata || {}),
              payosWebhook: data,
            },
          },
          { silent: false }
        );
        return res.status(200).json({ message: "Trạng thái không phải PAID – đã lưu log." });
      }

      const activation = await activatePackageFromTransaction(tx, amount, "payosWebhook", data);
      return res.status(200).json({ message: "OK", activationId: activation.id });
    } catch (e) {
      console.error("[payOS webhook] error:", e);
      return res.status(500).json({ message: "Webhook xử lý lỗi", detail: e.message });
    }
  },

  // FE chủ động xác nhận trạng thái khi không dùng webhook
  async confirm(req, res) {
    try {
      const orderCode = Number(req.query.orderCode || 0);
      if (!orderCode) {
        return res.status(400).json({ message: "orderCode không hợp lệ" });
      }

      const tx = await db.Transaction.findByPk(orderCode);
      if (!tx) {
        return res.status(404).json({ message: "Không tìm thấy giao dịch" });
      }

      if (String(tx.paymentMethod || "").toLowerCase() !== "payos") {
        return res.status(400).json({ message: "Giao dịch không phải PayOS" });
      }

      const userId = req.user?.id;
      if (userId) {
        const member = await db.Member.findOne({ where: { userId } });
        if (!member || member.id !== tx.memberId) {
          return res.status(403).json({ message: "Không có quyền xác nhận giao dịch này" });
        }
      }

      if (tx.paymentStatus === "paid") {
        return res.status(200).json({ message: "OK (đã xử lý trước đó)", activationId: tx.packageActivationId });
      }

      let info = await payosService.getPaymentLinkInformation(orderCode);
      if (!info) {
        const paymentLinkId =
          tx.metadata?.payos?.paymentLinkId ||
          tx.metadata?.payos?.paymentLinkID ||
          tx.metadata?.paymentLinkId ||
          tx.metadata?.paymentLinkID ||
          null;
        if (paymentLinkId) {
          info = await payosService.getPaymentLinkInformation(paymentLinkId);
        }
      }
      if (!info) {
        return res.status(502).json({ message: "Không lấy được trạng thái từ PayOS" });
      }

      const normalized = String(info.status || "").toUpperCase();
      const amountPaid = Number(info.amountPaid || 0);
      const amountTotal = Number(info.amount || tx.amount || 0);
      const isPaid = PAID_STATUSES.has(normalized) || (amountPaid > 0 && amountPaid >= amountTotal);

      if (!isPaid) {
        await tx.update(
          {
            paymentStatus: normalized ? normalized.toLowerCase() : "pending",
            metadata: {
              ...(tx.metadata || {}),
              payosConfirm: info,
            },
          },
          { silent: false }
        );
        return res.status(200).json({ message: "Chưa thanh toán", status: normalized || "PENDING" });
      }

      const activation = await activatePackageFromTransaction(
        tx,
        amountPaid || amountTotal,
        "payosConfirm",
        info
      );
      return res.status(200).json({ message: "OK", activationId: activation.id });
    } catch (e) {
      const status = e.statusCode || 500;
      console.error("[payOS confirm] error:", e);
      return res.status(status).json({ message: "Xác nhận lỗi", detail: e.message });
    }
  },
};

export default payosController;

