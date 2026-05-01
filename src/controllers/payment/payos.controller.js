import db from "../../models";
import payosService from "../../service/payment/payos.service";
import realtimeService from "../../service/realtime.service";
import { Op } from "sequelize";
import comboPurchaseFlowService from "../../service/comboPurchaseFlow.service";
import membershipCardService from "../../service/member/membershipCard.service";

const PAID_STATUSES = new Set(["PAID", "SUCCESS", "SUCCEEDED"]);
const ALLOWED_STATUSES = new Set(["pending", "completed", "failed", "refunded", "cancelled"]);
const EPS = 0.01;

const toAllowedStatus = (raw) => {
  const v = String(raw || "").toLowerCase();
  return ALLOWED_STATUSES.has(v) ? v : "pending";
};

const isPayosPaid = ({ status, amountPaid, amountTotal }) => {
  const normalized = String(status || "").toUpperCase();
  const paid = Number(amountPaid || 0);
  const total = Number(amountTotal || 0);
  return PAID_STATUSES.has(normalized) || (total > 0 && paid >= total);
};

async function activatePackageFromTransaction(tx, amount, metaKey, metaValue) {
  const parsedMeta = parseMeta(tx.metadata);
  const membershipMeta = parsedMeta?.membershipCard || null;
  const bundleMeta = parsedMeta?.bundle || {};
  const membershipPlan = membershipMeta?.planId
    ? await membershipCardService.getPlanById(Number(membershipMeta.planId), tx.gymId)
    : membershipMeta?.planMonths
      ? membershipCardService.getPlanByMonths(Number(membershipMeta.planMonths))
      : null;
  const bundleMembershipTxId = Number(bundleMeta?.membershipTransactionId || 0) || null;
  const bundlePackageAmount = Number(bundleMeta?.packageAmount || 0);
  const bundleMembershipAmount = Number(bundleMeta?.membershipAmount || 0);
  const normalizedPackageAmount = bundleMembershipTxId && bundlePackageAmount > 0
    ? bundlePackageAmount
    : (amount || tx.amount);

  if (tx.packageActivationId) {
    await tx.update(
      {
        paymentStatus: "completed",
        transactionDate: new Date(),
        amount: normalizedPackageAmount,
        metadata: {
          ...(tx.metadata || {}),
          [metaKey]: metaValue,
        },
      },
      { silent: false }
    );
    if (bundleMembershipTxId && bundleMembershipAmount > 0) {
      await db.Transaction.update(
        {
          paymentStatus: "completed",
          transactionDate: new Date(),
          amount: bundleMembershipAmount,
          metadata: {
            ...(parsedMeta || {}),
            [metaKey]: metaValue,
          },
        },
        { where: { id: bundleMembershipTxId }, silent: false }
      );
    }
    let membershipCard = null;
    if (membershipPlan) {
      membershipCard = await membershipCardService.createOrExtendMembershipCard({
        memberId: tx.memberId,
        gymId: tx.gymId,
        transactionId: bundleMembershipTxId || tx.id,
        plan: membershipPlan,
        purchaseSource: "package_bundle",
      });
    }
    return {
      id: tx.packageActivationId,
      membershipCard,
      membershipPlan,
      membershipTransactionId: bundleMembershipTxId || null,
    };
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
      paymentStatus: "completed",
      transactionDate: new Date(),
      packageActivationId: activation.id,
      amount: normalizedPackageAmount,
      metadata: {
        ...(tx.metadata || {}),
        [metaKey]: metaValue,
      },
    },
    { silent: false }
  );

  if (bundleMembershipTxId && bundleMembershipAmount > 0) {
    await db.Transaction.update(
      {
        paymentStatus: "completed",
        transactionDate: new Date(),
        amount: bundleMembershipAmount,
        metadata: {
          ...(parsedMeta || {}),
          [metaKey]: metaValue,
        },
      },
      { where: { id: bundleMembershipTxId }, silent: false }
    );
  }

  let membershipCard = null;
  if (membershipPlan) {
    membershipCard = await membershipCardService.createOrExtendMembershipCard({
      memberId: tx.memberId,
      gymId: tx.gymId,
      transactionId: bundleMembershipTxId || tx.id,
      plan: membershipPlan,
      purchaseSource: "package_bundle",
    });
  }

  return {
    id: activation.id,
    membershipCard,
    membershipPlan,
    membershipTransactionId: bundleMembershipTxId || null,
  };
}

async function applyFixedPlanDraftAfterPayment(tx, activationId) {
  if (!activationId) return { createdCount: 0 };
  const meta = parseMeta(tx.metadata);
  const draft = meta?.fixedPlanDraft;
  if (!draft) return { createdCount: 0 };

  const existed = await db.Booking.count({
    where: { packageActivationId: activationId },
  });
  if (existed > 0) return { createdCount: 0 };

  const trainerId = Number(draft.trainerId || tx.trainerId || 0) || null;
  const bookingDates = Array.isArray(draft.bookingDates)
    ? draft.bookingDates.map((d) => String(d || "").trim()).filter(Boolean)
    : [];
  const startTime = String(draft.startTime || "").trim();
  const endTime = String(draft.endTime || "").trim();

  if (!trainerId || !bookingDates.length || !startTime || !endTime) {
    return { createdCount: 0 };
  }

  const rows = bookingDates.map((bookingDate) => ({
    memberId: tx.memberId,
    trainerId,
    gymId: tx.gymId,
    packageId: tx.packageId,
    packageActivationId: activationId,
    bookingDate,
    startTime,
    endTime,
    status: "confirmed",
    createdBy: tx.processedBy || null,
  }));
  const created = await db.Booking.bulkCreate(rows);

  await tx.update(
    {
      metadata: {
        ...(meta || {}),
        fixedPlanAppliedAt: new Date().toISOString(),
      },
    },
    { silent: false }
  );

  return { createdCount: created.length };
}

const parseMeta = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

async function syncPurchaseOrderAfterPayment(poId) {
  const po = await db.PurchaseOrder.findByPk(poId, {
    include: [{ model: db.PurchaseOrderItem, as: "items" }],
  });
  if (!po) return null;

  const txs = await db.Transaction.findAll({
    where: {
      transactionType: "equipment_purchase",
      paymentStatus: "completed",
      metadata: { [Op.like]: `%\"purchaseOrderId\":${poId}%` },
    },
  });

  const total = Number(po.totalAmount || 0);
  const paid = txs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const allReceived = (po.items || []).every(
    (x) => Number(x.receivedQuantity || 0) >= Number(x.quantity || 0)
  );

  let nextStatus = po.status;
  if (po.status === "deposit_pending" && paid > EPS) {
    nextStatus = "deposit_paid";
  }
  if (allReceived && paid >= total - EPS) {
    nextStatus = "completed";
  } else if (allReceived && nextStatus === "deposit_paid") {
    nextStatus = "received";
  }

  if (nextStatus !== po.status) {
    po.status = nextStatus;
    await po.save();
  }

  return { po, paid, remaining: Math.max(0, total - paid) };
}

async function syncPurchaseRequestAfterPayment(requestId) {
  const pr = await db.PurchaseRequest.findByPk(requestId);
  if (!pr) return null;
  if (String(pr.status) === "approved_waiting_payment") {
    pr.status = "paid_waiting_admin_confirm";
    await pr.save();
  }
  return pr;
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
      if (tx.paymentStatus === "completed") {
        return res.status(200).json({ message: "OK (đã xử lý trước đó)" });
      }

      // Chỉ xử lý khi trạng thái thành công
      const normalized = String(status).toUpperCase();
      const isPaid = isPayosPaid({
        status: normalized,
        amountPaid: data.amountPaid,
        amountTotal: amount || tx.amount,
      });
      console.log(
        "[payOS webhook] normalized:",
        normalized,
        "amountPaid:",
        Number(data.amountPaid || 0),
        "amountTotal:",
        Number(amount || tx.amount || 0),
        "isPaid:",
        isPaid
      );

      if (!isPaid) {
        // Có thể log thêm trạng thái khác nếu cần
        await tx.update(
          {
            paymentStatus: toAllowedStatus(normalized),
            metadata: {
              ...(tx.metadata || {}),
              payosWebhook: data,
            },
          },
          { silent: false }
        );
        return res.status(200).json({ message: "Trạng thái không phải PAID – đã lưu log." });
      }

      if (tx.transactionType === "equipment_purchase") {
        const meta = parseMeta(tx.metadata);
        const poId = Number(meta.purchaseOrderId || 0);
        const requestId = Number(tx.purchaseRequestId || meta.purchaseRequestId || 0);

        if (requestId && (tx.paymentPhase || meta.paymentPhase)) {
          const result = await comboPurchaseFlowService.handleSuccessfulPayment(tx, data, "webhook");
          return res.status(200).json({ message: "OK", purchaseRequestId: result.request.id, phase: result.transaction.paymentPhase });
        }

        await tx.update(
          {
            paymentStatus: "completed",
            transactionDate: new Date(),
            amount: amount || tx.amount,
            metadata: {
              ...(tx.metadata || {}),
              payosWebhook: data,
            },
          },
          { silent: false }
        );
        const sync = poId ? await syncPurchaseOrderAfterPayment(poId) : null;
        const syncedRequest = requestId ? await syncPurchaseRequestAfterPayment(requestId) : null;
        if (sync?.po?.requestedBy) {
          await realtimeService.notifyUser(sync.po.requestedBy, {
            title: "Thanh toán PO thành công",
            message: `PO ${sync.po.code} đã ghi nhận thanh toán ${Number(tx.amount || 0).toLocaleString("vi-VN")}đ.`,
            notificationType: "payment",
            relatedType: "purchaseorder",
            relatedId: sync.po.id,
          });
        }
        if (syncedRequest?.requestedBy) {
          await realtimeService.notifyUser(syncedRequest.requestedBy, {
            title: "Thanh toán yêu cầu mua thành công",
            message: `${syncedRequest.code} đã được ghi nhận thanh toán, chờ admin xác nhận và chuyển hàng.`,
            notificationType: "payment",
            relatedType: "purchaserequest",
            relatedId: syncedRequest.id,
          });
        }
        await realtimeService.notifyAdministrators({
          title: "Vừa nhận được giao dịch thanh toán",
          message: requestId
            ? `Yêu cầu ${syncedRequest?.code || requestId} vừa thanh toán thành công (${Number(tx.amount || amount || 0).toLocaleString("vi-VN")}đ).`
            : `PO ${sync?.po?.code || poId || "-"} vừa thanh toán thành công (${Number(tx.amount || amount || 0).toLocaleString("vi-VN")}đ).`,
          notificationType: "payment",
          relatedType: requestId ? "purchaserequest" : "purchaseorder",
          relatedId: requestId || poId || tx.id,
        });
        return res.status(200).json({ message: "OK", purchaseOrderId: poId || null, purchaseRequestId: requestId || null });
      }

      if (tx.transactionType === "membership_card_purchase") {
        const meta = parseMeta(tx.metadata);
        const plan = meta?.membershipCard?.planId
          ? await membershipCardService.getPlanById(Number(meta.membershipCard.planId), tx.gymId)
          : membershipCardService.getPlanByMonths(Number(meta?.membershipCard?.planMonths || 0));
        if (!plan) {
          return res.status(400).json({ message: "Không tìm thấy thông tin thẻ thành viên trong giao dịch" });
        }
        await tx.update(
          {
            paymentStatus: "completed",
            transactionDate: new Date(),
            amount: amount || tx.amount,
            metadata: {
              ...(tx.metadata || {}),
              payosWebhook: data,
            },
          },
          { silent: false }
        );
        const card = await membershipCardService.createOrExtendMembershipCard({
          memberId: tx.memberId,
          gymId: tx.gymId,
          transactionId: tx.id,
          plan,
          purchaseSource: "standalone",
        });
        const member = await db.Member.findByPk(tx.memberId, { attributes: ["userId"] });
        await realtimeService.notifyUser(member?.userId, {
          title: "Thẻ thành viên đã được kích hoạt",
          message: `${plan.label} đã có hiệu lực đến ${new Date(card.endDate).toLocaleDateString("vi-VN")}.`,
          notificationType: "membership_card",
          relatedType: "membershipcard",
          relatedId: card.id,
        });
        await membershipCardService.notifyOwnerAboutMembershipCardPurchase({
          gymId: tx.gymId,
          memberId: tx.memberId,
          plan,
          card,
          transactionId: tx.id,
        });
        return res.status(200).json({ message: "OK", membershipCardId: card.id });
      }

      const activation = await activatePackageFromTransaction(tx, amount, "payosWebhook", data);
      await applyFixedPlanDraftAfterPayment(tx, activation.id);
      const pkg = tx.packageId ? await db.Package.findByPk(tx.packageId, { attributes: ["id", "name", "gymId"] }) : null;
      const memberUserId = tx.processedBy || (await db.Member.findByPk(tx.memberId, { attributes: ["userId"] }))?.userId;
      await realtimeService.notifyUser(memberUserId, {
        title: "Thanh toán gói thành công",
        message: `Gói ${pkg?.name || "tập"} đã được kích hoạt cho tài khoản của bạn.`,
        notificationType: "package_purchase",
        relatedType: "packageActivation",
        relatedId: activation.id,
      });
      if (tx.trainerId) {
        const trainer = await db.Trainer.findByPk(tx.trainerId, { attributes: ["userId"] });
        await realtimeService.notifyUser(trainer?.userId, {
          title: "Có hội viên mới từ PayOS",
          message: `Một hội viên vừa hoàn tất thanh toán gói ${pkg?.name || "tập"}.`,
          notificationType: "package_purchase",
          relatedType: "packageActivation",
          relatedId: activation.id,
        });
      }
      if (pkg?.gymId) {
        const gym = await db.Gym.findByPk(pkg.gymId, { attributes: ["ownerId"] });
        const member = await db.Member.findByPk(tx.memberId, {
          attributes: ["id", "userId"],
          include: [{ model: db.User, attributes: ["id", "username", "email"] }],
        });
        const memberName = member?.User?.username || "Một hội viên";
        await realtimeService.notifyUser(gym?.ownerId, {
          title: "Gym có giao dịch mới",
          message: `${memberName} vừa thanh toán gói ${pkg?.name || "tập"} thành công. Mã giao dịch: ${tx.transactionCode || `TX-${tx.id}`}.`,
          notificationType: "package_purchase",
          relatedType: "transaction",
          relatedId: tx.id,
        });
        if (activation?.membershipCard && activation?.membershipPlan) {
          await membershipCardService.notifyOwnerAboutMembershipCardPurchase({
            gymId: tx.gymId,
            memberId: tx.memberId,
            plan: activation.membershipPlan,
            card: activation.membershipCard,
            transactionId: activation.membershipTransactionId,
          });
        }
      }
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
      if (userId && tx.transactionType !== "equipment_purchase") {
        const member = await db.Member.findByPk(tx.memberId, { attributes: ["id", "userId"] });
        if (!member || Number(member.userId) !== Number(userId)) {
          return res.status(403).json({ message: "Không có quyền xác nhận giao dịch này" });
        }
      }

      if (tx.paymentStatus === "completed") {
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
      const isPaid = isPayosPaid({
        status: normalized,
        amountPaid,
        amountTotal,
      });

      if (!isPaid) {
        await tx.update(
          {
            paymentStatus: toAllowedStatus(normalized),
            metadata: {
              ...(tx.metadata || {}),
              payosConfirm: info,
            },
          },
          { silent: false }
        );
        return res.status(200).json({ message: "Chưa thanh toán", status: normalized || "PENDING" });
      }

      if (tx.transactionType === "equipment_purchase") {
        const meta = parseMeta(tx.metadata);
        const poId = Number(meta.purchaseOrderId || 0);
        const requestId = Number(tx.purchaseRequestId || meta.purchaseRequestId || 0);

        if (requestId && (tx.paymentPhase || meta.paymentPhase)) {
          const result = await comboPurchaseFlowService.handleSuccessfulPayment(tx, info, "confirm");
          return res.status(200).json({ message: "OK", purchaseRequestId: result.request.id, phase: result.transaction.paymentPhase });
        }

        await tx.update(
          {
            paymentStatus: "completed",
            transactionDate: new Date(),
            amount: amountPaid || amountTotal || tx.amount,
            metadata: {
              ...(tx.metadata || {}),
              payosConfirm: info,
            },
          },
          { silent: false }
        );
        const sync = poId ? await syncPurchaseOrderAfterPayment(poId) : null;
        const syncedRequest = requestId ? await syncPurchaseRequestAfterPayment(requestId) : null;
        if (sync?.po?.requestedBy) {
          await realtimeService.notifyUser(sync.po.requestedBy, {
            title: "Thanh toán PO thành công",
            message: `PO ${sync.po.code} đã ghi nhận thanh toán ${Number(tx.amount || 0).toLocaleString("vi-VN")}đ.`,
            notificationType: "payment",
            relatedType: "purchaseorder",
            relatedId: sync.po.id,
          });
        }
        if (syncedRequest?.requestedBy) {
          await realtimeService.notifyUser(syncedRequest.requestedBy, {
            title: "Thanh toán yêu cầu mua thành công",
            message: `${syncedRequest.code} đã được ghi nhận thanh toán, chờ admin xác nhận và chuyển hàng.`,
            notificationType: "payment",
            relatedType: "purchaserequest",
            relatedId: syncedRequest.id,
          });
        }
        await realtimeService.notifyAdministrators({
          title: "Vừa nhận được giao dịch thanh toán",
          message: requestId
            ? `Yêu cầu ${syncedRequest?.code || requestId} vừa thanh toán thành công (${Number(tx.amount || amountPaid || amountTotal || 0).toLocaleString("vi-VN")}đ).`
            : `PO ${sync?.po?.code || poId || "-"} vừa thanh toán thành công (${Number(tx.amount || amountPaid || amountTotal || 0).toLocaleString("vi-VN")}đ).`,
          notificationType: "payment",
          relatedType: requestId ? "purchaserequest" : "purchaseorder",
          relatedId: requestId || poId || tx.id,
        });
        return res.status(200).json({ message: "OK", purchaseOrderId: poId || null, purchaseRequestId: requestId || null });
      }

      if (tx.transactionType === "membership_card_purchase") {
        const meta = parseMeta(tx.metadata);
        const plan = meta?.membershipCard?.planId
          ? await membershipCardService.getPlanById(Number(meta.membershipCard.planId), tx.gymId)
          : membershipCardService.getPlanByMonths(Number(meta?.membershipCard?.planMonths || 0));
        if (!plan) {
          return res.status(400).json({ message: "Không tìm thấy thông tin thẻ thành viên trong giao dịch" });
        }
        await tx.update(
          {
            paymentStatus: "completed",
            transactionDate: new Date(),
            amount: amountPaid || amountTotal || tx.amount,
            metadata: {
              ...(tx.metadata || {}),
              payosConfirm: info,
            },
          },
          { silent: false }
        );
        const card = await membershipCardService.createOrExtendMembershipCard({
          memberId: tx.memberId,
          gymId: tx.gymId,
          transactionId: tx.id,
          plan,
          purchaseSource: "standalone",
        });
        const member = await db.Member.findByPk(tx.memberId, { attributes: ["userId"] });
        await realtimeService.notifyUser(member?.userId, {
          title: "Thẻ thành viên đã được kích hoạt",
          message: `${plan.label} đã có hiệu lực đến ${new Date(card.endDate).toLocaleDateString("vi-VN")}.`,
          notificationType: "membership_card",
          relatedType: "membershipcard",
          relatedId: card.id,
        });
        await membershipCardService.notifyOwnerAboutMembershipCardPurchase({
          gymId: tx.gymId,
          memberId: tx.memberId,
          plan,
          card,
          transactionId: tx.id,
        });
        return res.status(200).json({ message: "OK", membershipCardId: card.id });
      }

      const activation = await activatePackageFromTransaction(tx, amountPaid || amountTotal, "payosConfirm", info);
      await applyFixedPlanDraftAfterPayment(tx, activation.id);
      const pkg = tx.packageId ? await db.Package.findByPk(tx.packageId, { attributes: ["id", "name", "gymId"] }) : null;
      const memberUserId = userId || (await db.Member.findByPk(tx.memberId, { attributes: ["userId"] }))?.userId;
      await realtimeService.notifyUser(memberUserId, {
        title: "Thanh toán gói thành công",
        message: `Gói ${pkg?.name || "tập"} đã được kích hoạt cho tài khoản của bạn.`,
        notificationType: "package_purchase",
        relatedType: "packageActivation",
        relatedId: activation.id,
      });
      if (tx.trainerId) {
        const trainer = await db.Trainer.findByPk(tx.trainerId, { attributes: ["userId"] });
        await realtimeService.notifyUser(trainer?.userId, {
          title: "Có hội viên mới từ PayOS",
          message: `Một hội viên vừa hoàn tất thanh toán gói ${pkg?.name || "tập"}.`,
          notificationType: "package_purchase",
          relatedType: "packageActivation",
          relatedId: activation.id,
        });
      }
      if (pkg?.gymId) {
        const gym = await db.Gym.findByPk(pkg.gymId, { attributes: ["ownerId"] });
        const member = await db.Member.findByPk(tx.memberId, {
          attributes: ["id", "userId"],
          include: [{ model: db.User, attributes: ["id", "username", "email"] }],
        });
        const memberName = member?.User?.username || "Một hội viên";
        await realtimeService.notifyUser(gym?.ownerId, {
          title: "Gym có giao dịch mới",
          message: `${memberName} vừa thanh toán gói ${pkg?.name || "tập"} thành công. Mã giao dịch: ${tx.transactionCode || `TX-${tx.id}`}.`,
          notificationType: "package_purchase",
          relatedType: "transaction",
          relatedId: tx.id,
        });
        if (activation?.membershipCard && activation?.membershipPlan) {
          await membershipCardService.notifyOwnerAboutMembershipCardPurchase({
            gymId: tx.gymId,
            memberId: tx.memberId,
            plan: activation.membershipPlan,
            card: activation.membershipCard,
            transactionId: activation.membershipTransactionId,
          });
        }
      }
      return res.status(200).json({ message: "OK", activationId: activation.id });
    } catch (e) {
      const status = e.statusCode || 500;
      console.error("[payOS confirm] error:", e);
      return res.status(status).json({ message: "Xác nhận lỗi", detail: e.message });
    }
  },
};

export default payosController;