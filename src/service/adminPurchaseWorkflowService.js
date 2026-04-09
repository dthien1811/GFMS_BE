const procurementStockHelper = require("./procurementStockHelper");
const { computeFulfillmentPlan } = procurementStockHelper;
// src/service/adminPurchaseWorkflowService.js
const { Op } = require("sequelize");
const realtimeServiceModule = require("./realtime.service");
const realtimeService = realtimeServiceModule.default || realtimeServiceModule;
const {
  sequelize,
  Quotation,
  QuotationItem,
  PurchaseOrder,
  PurchaseOrderItem,
  Receipt,
  ReceiptItem,
  Equipment,
  EquipmentStock,
  Inventory,
  Supplier,
  Gym,
  User,
  Transaction,
  AuditLog,
  Notification,
  Message,
  PurchaseRequest,
  EquipmentUnit,
} = require("../models");
const notificationGymService = require("./notification-gym.service");
const { attachGymIdsToNotifications } = notificationGymService;
const equipmentUnitEventUtils = require("../utils/equipmentUnitEvent");
const { logEquipmentUnitEvents } = equipmentUnitEventUtils;

const EPS = 0.01;

async function createEquipmentUnits({ gymId, equipmentId, quantity, notes }, transaction) {
  const qty = Math.max(0, Number(quantity || 0));
  if (!qty) return [];

  const now = Date.now();
  return EquipmentUnit.bulkCreate(
    Array.from({ length: qty }, (_, index) => ({
      gymId: Number(gymId),
      equipmentId: Number(equipmentId),
      assetCode: `EQ-${equipmentId}-GYM-${gymId}-${now}-${index + 1}`,
      status: "active",
      usageStatus: "in_stock",
      notes: notes || null,
    })),
    { transaction }
  );
}

async function findEquipmentPurchaseTxsForPO(poId, transaction) {
  const poIdN = Number(poId);
  try {
    return await Transaction.findAll({
      where: {
        transactionType: "equipment_purchase",
        [Op.and]: [sequelize.where(sequelize.json("metadata.purchaseOrderId"), poIdN)],
      },
      transaction,
      lock: transaction ? transaction.LOCK.SHARE : undefined,
    });
  } catch (e) {
    return await Transaction.findAll({
      where: {
        transactionType: "equipment_purchase",
        metadata: { [Op.like]: `%\"purchaseOrderId\":${poIdN}%` },
      },
      transaction,
      lock: transaction ? transaction.LOCK.SHARE : undefined,
    });
  }
}

function sumCompletedPayments(txs) {
  return (txs || [])
    .filter((x) => String(x.paymentStatus || "").toLowerCase() === "completed")
    .reduce((s, x) => s + Number(x.amount || 0), 0);
}

function sumDepositPhasePayments(txs) {
  return (txs || [])
    .filter(
      (x) =>
        String(x.paymentStatus || "").toLowerCase() === "completed" &&
        String(x.metadata?.paymentPhase || "").toLowerCase() === "deposit"
    )
    .reduce((s, x) => s + Number(x.amount || 0), 0);
}

function depositRequirementMet(totalAmount, txs) {
  const total = Number(totalAmount || 0);
  const need = total * 0.3;
  const dep = sumDepositPhasePayments(txs);
  if (dep >= need - EPS) return true;
  const anyLabeled = (txs || []).some((x) => x.metadata && x.metadata.paymentPhase);
  if (!anyLabeled) {
    return sumCompletedPayments(txs) >= need - EPS;
  }
  return dep >= need - EPS;
}

function toInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
function paging(q) {
  const page = Math.max(1, toInt(q.page, 1));
  const limit = Math.min(100, Math.max(1, toInt(q.limit, 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
function genCode(prefix) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const r = String(Math.floor(Math.random() * 900000) + 100000);
  return `${prefix}-${y}${m}${day}-${r}`;
}

async function createAudit({ userId, action, tableName, recordId, oldValues, newValues, req }, t) {
  return AuditLog.create(
    {
      userId: userId || null,
      action,
      tableName,
      recordId: recordId || null,
      oldValues: oldValues ?? null,
      newValues: newValues ?? null,
      ipAddress: req?.ip || null,
      userAgent: req?.headers?.["user-agent"] || null,
    },
    { transaction: t }
  );
}

async function createNotification({ userId, title, message, notificationType, relatedType, relatedId }, t) {
  if (!userId) return null;
  const row = await Notification.create(
    {
      userId,
      title,
      message,
      notificationType: notificationType || null,
      relatedType: relatedType || null,
      relatedId: relatedId || null,
      isRead: false,
    },
    { transaction: t }
  );

  const payload = {
    id: row.id,
    title,
    message,
    notificationType: notificationType || null,
    relatedType: relatedType || null,
    relatedId: relatedId || null,
    isRead: false,
    createdAt: row.createdAt,
  };

  const [enrichedPayload] = await attachGymIdsToNotifications([payload]);

  if (t?.afterCommit) {
    t.afterCommit(() => {
      realtimeService.emitUser(userId, "notification:new", enrichedPayload);
    });
  } else {
    realtimeService.emitUser(userId, "notification:new", enrichedPayload);
  }

  return row;
}

async function createMessage({ senderId, receiverId, content }, t) {
  if (!senderId || !receiverId) return null;
  return Message.create(
    {
      senderId,
      receiverId,
      content,
      isRead: false,
    },
    { transaction: t }
  );
}

class AdminPurchaseWorkflowService {
  /* ========================= QUOTATIONS =========================
     Model thật: quotation.status = pending/approved/rejected/expired
  */

  async getQuotations(query) {
    const { page, limit, offset } = paging(query);
    const where = {};

    if (query.status && query.status !== "all") where.status = query.status;
    if (query.gymId && query.gymId !== "all") where.gymId = toInt(query.gymId, query.gymId);
    if (query.supplierId && query.supplierId !== "all")
      where.supplierId = toInt(query.supplierId, query.supplierId);

    if (query.q && String(query.q).trim()) {
      const q = String(query.q).trim();
      where[Op.or] = [{ code: { [Op.like]: `%${q}%` } }, { notes: { [Op.like]: `%${q}%` } }];
    }

    const { rows, count } = await Quotation.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: [
        { model: Supplier, as: "supplier", attributes: ["id", "name"] },
        { model: Gym, as: "gym", attributes: ["id", "name"] },
        { model: User, as: "requester", attributes: ["id", "username", "email"] },
      ],
    });

    return {
      data: rows.map((row) => {
        const json = row.toJSON ? row.toJSON() : row;
        const snapshot = json.stockSnapshot || null;
        return {
          ...json,
          fulfillmentPlan: snapshot?.fulfillmentPlan || computeFulfillmentPlan(json.quantity, snapshot),
        };
      }),
      meta: { page, limit, total: count },
    };
  }

  async getQuotationDetail(id) {
    const q = await Quotation.findByPk(id, {
      include: [
        { model: Supplier, as: "supplier", attributes: ["id", "name"] },
        { model: Gym, as: "gym", attributes: ["id", "name"] },
        { model: User, as: "requester", attributes: ["id", "username", "email"] },
        {
          model: QuotationItem,
          as: "items",
          include: [{ model: Equipment, as: "equipment", attributes: ["id", "name"] }],
        },
      ],
    });
    if (!q) throw new Error("Quotation not found");
    return q;
  }

  // Quote = update giá item + totalAmount. Vì schema không có 'quoted' nên giữ status=pending.
  async quoteQuotation(quotationId, body, adminId, req) {
    return sequelize.transaction(async (t) => {
      const quotation = await Quotation.findByPk(quotationId, {
        include: [{ model: QuotationItem, as: "items" }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!quotation) throw new Error("Quotation not found");
      if (quotation.status !== "pending") throw new Error("Only pending quotation can be quoted");

      const oldQ = quotation.toJSON();

      const patches = Array.isArray(body?.items) ? body.items : [];
      let total = 0;

      for (const it of quotation.items || []) {
        const patch = patches.find((x) => String(x.id) === String(it.id));
        if (patch && patch.unitPrice != null) {
          const up = Number(patch.unitPrice);
          if (!Number.isFinite(up) || up < 0) throw new Error("Invalid unitPrice");
          it.unitPrice = up;
          it.totalPrice = up * Number(it.quantity || 0);
          await it.save({ transaction: t });
        }
        total += Number(it.totalPrice || 0);
      }

      quotation.totalAmount = total;
      await quotation.save({ transaction: t });

      await createAudit(
        {
          userId: adminId,
          action: "QUOTATION_QUOTED",
          tableName: "quotation",
          recordId: quotation.id,
          oldValues: oldQ,
          newValues: quotation.toJSON(),
          req,
        },
        t
      );

      await createNotification(
        {
          userId: quotation.requestedBy,
          title: "Quotation updated",
          message: `Báo giá đã được cập nhật cho quotation ${quotation.code}.`,
          notificationType: "quotation",
          relatedType: "quotation",
          relatedId: quotation.id,
        },
        t
      );

      if (adminId && quotation.requestedBy) {
        await createMessage(
          {
            senderId: adminId,
            receiverId: quotation.requestedBy,
            content: `Admin đã cập nhật báo giá cho quotation ${quotation.code}.`,
          },
          t
        );
      }

      return quotation;
    });
  }

  async approveQuotation(quotationId, adminId, req) {
    return sequelize.transaction(async (t) => {
      const quotation = await Quotation.findByPk(quotationId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!quotation) throw new Error("Quotation not found");
      if (quotation.status !== "pending") throw new Error("Only pending quotation can be approved");

      const oldQ = quotation.toJSON();

      quotation.status = "approved";
      await quotation.save({ transaction: t });

      await createAudit(
        {
          userId: adminId,
          action: "QUOTATION_APPROVED",
          tableName: "quotation",
          recordId: quotation.id,
          oldValues: oldQ,
          newValues: quotation.toJSON(),
          req,
        },
        t
      );

      await createNotification(
        {
          userId: quotation.requestedBy,
          title: "Quotation approved",
          message: `Quotation ${quotation.code} đã được duyệt.`,
          notificationType: "quotation",
          relatedType: "quotation",
          relatedId: quotation.id,
        },
        t
      );

      if (adminId && quotation.requestedBy) {
        await createMessage(
          {
            senderId: adminId,
            receiverId: quotation.requestedBy,
            content: `Quotation ${quotation.code} đã được duyệt.`,
          },
          t
        );
      }

      return quotation;
    });
  }

  async rejectQuotation(quotationId, body, adminId, req) {
    return sequelize.transaction(async (t) => {
      const quotation = await Quotation.findByPk(quotationId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!quotation) throw new Error("Quotation not found");
      if (quotation.status !== "pending") throw new Error("Only pending quotation can be rejected");

      const reason = String(body?.rejectionReason || body?.reason || "").trim();
      if (!reason) throw new Error("Missing rejectionReason");

      const oldQ = quotation.toJSON();

      quotation.status = "rejected";
      quotation.notes = reason;
      await quotation.save({ transaction: t });

      await createAudit(
        {
          userId: adminId,
          action: "QUOTATION_REJECTED",
          tableName: "quotation",
          recordId: quotation.id,
          oldValues: oldQ,
          newValues: quotation.toJSON(),
          req,
        },
        t
      );

      await createNotification(
        {
          userId: quotation.requestedBy,
          title: "Quotation rejected",
          message: `Quotation ${quotation.code} bị từ chối. Lý do: ${reason}`,
          notificationType: "quotation",
          relatedType: "quotation",
          relatedId: quotation.id,
        },
        t
      );

      if (adminId && quotation.requestedBy) {
        await createMessage(
          {
            senderId: adminId,
            receiverId: quotation.requestedBy,
            content: `Quotation ${quotation.code} bị từ chối. Lý do: ${reason}`,
          },
          t
        );
      }

      return quotation;
    });
  }

  /* ========================= PURCHASE ORDERS =========================
     Model thật: purchaseorder.status = pending/approved/ordered/delivered/cancelled
  */

  async createPOFromQuotation(quotationId, adminId, req) {
    return sequelize.transaction(async (t) => {
      const quotation = await Quotation.findByPk(quotationId, {
        include: [{ model: QuotationItem, as: "items" }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!quotation) throw new Error("Quotation not found");
      if (quotation.status !== "approved") throw new Error("Quotation must be approved before creating PO");

      const po = await PurchaseOrder.create(
        {
          code: genCode("PO"),
          quotationId: quotation.id,
          supplierId: quotation.supplierId,
          gymId: quotation.gymId,
          requestedBy: quotation.requestedBy,
          approvedBy: null,
          orderDate: new Date(),
          expectedDeliveryDate: null,
          status: "draft",
          totalAmount: quotation.totalAmount || 0,
          notes: `Created from quotation ${quotation.code}`,
        },
        { transaction: t }
      );

      for (const it of quotation.items || []) {
        await PurchaseOrderItem.create(
          {
            purchaseOrderId: po.id,
            equipmentId: it.equipmentId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
            receivedQuantity: 0,
            notes: it.notes || null,
          },
          { transaction: t }
        );
      }

      await createAudit(
        {
          userId: adminId,
          action: "PO_CREATED",
          tableName: "purchaseorder",
          recordId: po.id,
          oldValues: null,
          newValues: po.toJSON(),
          req,
        },
        t
      );

      await createNotification(
        {
          userId: quotation.requestedBy,
          title: "Purchase Order created",
          message: `Đã tạo PO ${po.code} từ quotation ${quotation.code}.`,
          notificationType: "purchaseorder",
          relatedType: "purchaseorder",
          relatedId: po.id,
        },
        t
      );

      return po;
    });
  }

  async getPurchaseOrders(query) {
    const { page, limit, offset } = paging(query);
    const where = {};

    if (query.status && query.status !== "all") where.status = query.status;
    if (query.gymId && query.gymId !== "all") where.gymId = toInt(query.gymId, query.gymId);
    if (query.supplierId && query.supplierId !== "all")
      where.supplierId = toInt(query.supplierId, query.supplierId);

    if (query.q && String(query.q).trim()) {
      const q = String(query.q).trim();
      where[Op.or] = [{ code: { [Op.like]: `%${q}%` } }, { notes: { [Op.like]: `%${q}%` } }];
    }

    const { rows, count } = await PurchaseOrder.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: [
        { model: Supplier, as: "supplier", attributes: ["id", "name"] },
        { model: Gym, as: "gym", attributes: ["id", "name"] },
        { model: Quotation, as: "quotation", attributes: ["id", "code"] },
        { model: User, as: "requester", attributes: ["id", "username", "email"] },
        { model: User, as: "approver", attributes: ["id", "username", "email"] },
      ],
    });

    return {
      data: rows.map((row) => {
        const json = row.toJSON ? row.toJSON() : row;
        const snapshot = json.stockSnapshot || null;
        return {
          ...json,
          fulfillmentPlan: snapshot?.fulfillmentPlan || computeFulfillmentPlan(json.quantity, snapshot),
        };
      }),
      meta: { page, limit, total: count },
    };
  }

  async getPurchaseOrderDetail(id) {
    const po = await PurchaseOrder.findByPk(id, {
      include: [
        { model: Supplier, as: "supplier", attributes: ["id", "name"] },
        { model: Gym, as: "gym", attributes: ["id", "name"] },
        { model: Quotation, as: "quotation", attributes: ["id", "code"] },
        { model: User, as: "requester", attributes: ["id", "username", "email"] },
        { model: User, as: "approver", attributes: ["id", "username", "email"] },
        {
          model: PurchaseOrderItem,
          as: "items",
          include: [{ model: Equipment, as: "equipment", attributes: ["id", "name"] }],
        },
      ],
    });
    if (!po) throw new Error("PurchaseOrder not found");
    return po;
  }

  async approvePurchaseOrder(id, adminId, req) {
    return sequelize.transaction(async (t) => {
      const po = await PurchaseOrder.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!po) throw new Error("PurchaseOrder not found");
      if (po.status !== "draft") throw new Error("Only draft PO can move to deposit_pending");

      const oldPO = po.toJSON();

      po.status = "deposit_pending";
      po.approvedBy = adminId || null;
      await po.save({ transaction: t });

      await createAudit(
        {
          userId: adminId,
          action: "PO_APPROVED",
          tableName: "purchaseorder",
          recordId: po.id,
          oldValues: oldPO,
          newValues: po.toJSON(),
          req,
        },
        t
      );

      await createNotification(
        {
          userId: po.requestedBy,
          title: "Purchase Order approved",
          message: `PO ${po.code} đã được duyệt.`,
          notificationType: "purchaseorder",
          relatedType: "purchaseorder",
          relatedId: po.id,
        },
        t
      );

      return po;
    });
  }

  async orderPurchaseOrder(id, body, adminId, req) {
    return sequelize.transaction(async (t) => {
      const po = await PurchaseOrder.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!po) throw new Error("PurchaseOrder not found");
      if (po.status !== "deposit_paid") throw new Error("PO must be deposit_paid (30% received) before ordered");

      const oldPO = po.toJSON();

      po.status = "ordered";
      if (body?.expectedDeliveryDate) po.expectedDeliveryDate = new Date(body.expectedDeliveryDate);
      await po.save({ transaction: t });

      await createAudit(
        {
          userId: adminId,
          action: "PO_ORDERED",
          tableName: "purchaseorder",
          recordId: po.id,
          oldValues: oldPO,
          newValues: po.toJSON(),
          req,
        },
        t
      );

      await createNotification(
        {
          userId: po.requestedBy,
          title: "Purchase Order ordered",
          message: `PO ${po.code} đã chuyển sang trạng thái ordered.`,
          notificationType: "purchaseorder",
          relatedType: "purchaseorder",
          relatedId: po.id,
        },
        t
      );

      return po;
    });
  }

  async cancelPurchaseOrder(id, body, adminId, req) {
    return sequelize.transaction(async (t) => {
      const po = await PurchaseOrder.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!po) throw new Error("PurchaseOrder not found");
      if (po.status === "completed" || po.status === "cancelled") throw new Error("PO cannot be cancelled");

      const reason = String(body?.reason || "").trim();
      if (!reason) throw new Error("Missing reason");

      const oldPO = po.toJSON();

      po.status = "cancelled";
      po.notes = `CANCELLED: ${reason}`;
      await po.save({ transaction: t });

      await createAudit(
        {
          userId: adminId,
          action: "PO_CANCELLED",
          tableName: "purchaseorder",
          recordId: po.id,
          oldValues: oldPO,
          newValues: po.toJSON(),
          req,
        },
        t
      );

      await createNotification(
        {
          userId: po.requestedBy,
          title: "Purchase Order cancelled",
          message: `PO ${po.code} bị huỷ. Lý do: ${reason}`,
          notificationType: "purchaseorder",
          relatedType: "purchaseorder",
          relatedId: po.id,
        },
        t
      );

      return po;
    });
  }

  /* ========================= RECEIPTS ========================= */

  async getReceipts(query) {
    const { page, limit, offset } = paging(query);
    const where = {};

    if (query.type) where.type = query.type;
    if (query.status && query.status !== "all") where.status = query.status;
    if (query.gymId && query.gymId !== "all") where.gymId = toInt(query.gymId, query.gymId);

    if (query.q && String(query.q).trim()) {
      const q = String(query.q).trim();
      where[Op.or] = [{ code: { [Op.like]: `%${q}%` } }, { notes: { [Op.like]: `%${q}%` } }];
    }

    const { rows, count } = await Receipt.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: [
        { model: Gym, as: "gym", attributes: ["id", "name"] },
        { model: User, as: "processor", attributes: ["id", "username", "email"] },
        {
          model: PurchaseOrder,
          as: "purchaseOrder",
          attributes: ["id", "code", "supplierId"],
          include: [{ model: Supplier, as: "supplier", attributes: ["id", "name"] }],
        },
      ],
    });

    return {
      data: rows.map((row) => {
        const json = row.toJSON ? row.toJSON() : row;
        const snapshot = json.stockSnapshot || null;
        return {
          ...json,
          fulfillmentPlan: snapshot?.fulfillmentPlan || computeFulfillmentPlan(json.quantity, snapshot),
        };
      }),
      meta: { page, limit, total: count },
    };
  }

  async getReceiptDetail(id) {
    const r = await Receipt.findByPk(id, {
      include: [
        { model: Gym, as: "gym", attributes: ["id", "name"] },
        { model: User, as: "processor", attributes: ["id", "username", "email"] },
        {
          model: PurchaseOrder,
          as: "purchaseOrder",
          attributes: ["id", "code"],
          include: [{ model: Supplier, as: "supplier", attributes: ["id", "name"] }],
        },
        {
          model: ReceiptItem,
          as: "items",
          include: [{ model: Equipment, as: "equipment", attributes: ["id", "name"] }],
        },
      ],
    });
    if (!r) throw new Error("Receipt not found");
    return r;
  }

  async updateReceiptItems(receiptId, body, adminId, req) {
    return sequelize.transaction(async (t) => {
      const receipt = await Receipt.findByPk(receiptId, {
        include: [{ model: ReceiptItem, as: "items" }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!receipt) throw new Error("Receipt not found");
      if (receipt.status !== "pending") throw new Error("Only pending receipt can be edited");

      const po = receipt.purchaseOrderId
        ? await PurchaseOrder.findByPk(receipt.purchaseOrderId, {
            include: [{ model: PurchaseOrderItem, as: "items" }],
            transaction: t,
            lock: t.LOCK.UPDATE,
          })
        : null;

      const oldR = receipt.toJSON();
      const patches = Array.isArray(body?.items) ? body.items : [];

      let total = 0;

      for (const it of receipt.items || []) {
        const p = patches.find((x) => String(x.id) === String(it.id));
        if (!p) {
          total += Number(it.totalPrice || 0);
          continue;
        }

        const newQty = Number(p.quantity);
        if (!Number.isFinite(newQty) || newQty < 0) throw new Error("Invalid quantity");

        // Validate against PO remaining (if exists)
        if (po) {
          const poi = (po.items || []).find((x) => String(x.equipmentId) === String(it.equipmentId));
          if (poi) {
            const orderedQty = Number(poi.quantity || 0);
            const receivedQty = Number(poi.receivedQuantity || 0);
            const remainingQty = Math.max(0, orderedQty - receivedQty);
            if (newQty > remainingQty) {
              throw new Error(
                `Quantity exceeds remaining for equipmentId=${it.equipmentId}. Remaining=${remainingQty}`
              );
            }
          }
        }

        it.quantity = newQty;
        const unitPrice = Number(it.unitPrice || 0);
        it.totalPrice = unitPrice * newQty;
        if (p.notes != null) it.notes = String(p.notes);
        await it.save({ transaction: t });
        total += Number(it.totalPrice || 0);
      }

      receipt.totalValue = total;
      receipt.processedBy = adminId || receipt.processedBy;
      await receipt.save({ transaction: t });

      await createAudit(
        {
          userId: adminId,
          action: "RECEIPT_ITEMS_UPDATED",
          tableName: "receipt",
          recordId: receipt.id,
          oldValues: oldR,
          newValues: receipt.toJSON(),
          req,
        },
        t
      );

      return receipt;
    });
  }

  async createInboundReceiptFromPO(purchaseOrderId, adminId, req) {
    return sequelize.transaction(async (t) => {
      const po = await PurchaseOrder.findByPk(purchaseOrderId, {
        include: [{ model: PurchaseOrderItem, as: "items" }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!po) throw new Error("PurchaseOrder not found");
      const okRecv = ["deposit_paid", "ordered", "partially_received", "received"];
      if (!okRecv.includes(po.status))
        throw new Error("PO must be deposit_paid or ordered (receiving) to create inbound receipt");

      // Enterprise: receipt tạo theo phần còn lại (partial delivery supported)
      const remainingItems = (po.items || [])
        .map((it) => {
          const orderedQty = Number(it.quantity || 0);
          const receivedQty = Number(it.receivedQuantity || 0);
          const remainingQty = Math.max(0, orderedQty - receivedQty);
          return { it, orderedQty, receivedQty, remainingQty };
        })
        .filter((x) => x.remainingQty > 0);

      if (!remainingItems.length) {
        throw new Error("PO has no remaining items to receive");
      }

      const receipt = await Receipt.create(
        {
          code: genCode("RC"),
          purchaseOrderId: po.id,
          type: "inbound",
          gymId: po.gymId,
          processedBy: adminId || null,
          receiptDate: new Date(),
          status: "pending",
          totalValue: 0,
          notes: `Inbound (remaining) from PO ${po.code}`,
        },
        { transaction: t }
      );

      let receiptTotal = 0;
      for (const x of remainingItems) {
        const it = x.it;
        const qty = x.remainingQty;
        const unitPrice = Number(it.unitPrice || 0);
        const totalPrice = unitPrice * qty;
        receiptTotal += totalPrice;

        await ReceiptItem.create(
          {
            receiptId: receipt.id,
            equipmentId: it.equipmentId,
            quantity: qty,
            unitPrice: it.unitPrice,
            totalPrice,
            notes: it.notes || null,
          },
          { transaction: t }
        );
      }

      receipt.totalValue = receiptTotal;
      await receipt.save({ transaction: t });

      await createAudit(
        {
          userId: adminId,
          action: "RECEIPT_CREATED",
          tableName: "receipt",
          recordId: receipt.id,
          oldValues: null,
          newValues: receipt.toJSON(),
          req,
        },
        t
      );

      await createNotification(
        {
          userId: po.requestedBy,
          title: "Receipt created",
          message: `Đã tạo receipt ${receipt.code} từ PO ${po.code}.`,
          notificationType: "receipt",
          relatedType: "receipt",
          relatedId: receipt.id,
        },
        t
      );

      return receipt;
    });
  }

  async completeReceipt(receiptId, adminId, req) {
    return sequelize.transaction(async (t) => {
      let poAwaitingFinalPayment = null;

      const receipt = await Receipt.findByPk(receiptId, {
        include: [{ model: ReceiptItem, as: "items" }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!receipt) throw new Error("Receipt not found");
      if (receipt.status !== "pending") throw new Error("Only pending receipt can be completed");

      const oldR = receipt.toJSON();

      receipt.status = "completed";
      receipt.processedBy = adminId || receipt.processedBy;
      await receipt.save({ transaction: t });

      if (receipt.type === "inbound") {
        const po = receipt.purchaseOrderId
          ? await PurchaseOrder.findByPk(receipt.purchaseOrderId, {
              include: [{ model: PurchaseOrderItem, as: "items" }],
              transaction: t,
              lock: t.LOCK.UPDATE,
            })
          : null;

        for (const item of receipt.items || []) {
          const equipmentId = item.equipmentId;
          if (!equipmentId) continue;

          let stock = await EquipmentStock.findOne({
            where: { gymId: receipt.gymId, equipmentId },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });

          const beforeQty = stock ? Number(stock.quantity || 0) : 0;
          const addQty = Number(item.quantity || 0);
          const afterQty = beforeQty + addQty;

          if (!stock) {
            stock = await EquipmentStock.create(
              {
                gymId: receipt.gymId,
                equipmentId,
                quantity: afterQty,
                reservedQuantity: 0,
                availableQuantity: afterQty,
                lastRestocked: new Date(),
              },
              { transaction: t }
            );
          } else {
            stock.quantity = afterQty;
            stock.availableQuantity = Number(stock.availableQuantity || 0) + addQty;
            stock.lastRestocked = new Date();
            await stock.save({ transaction: t });
          }

          await Inventory.create(
            {
              gymId: receipt.gymId,
              equipmentId,
              transactionType: "purchase",
              transactionId: receipt.id,
              transactionCode: receipt.code,
              quantity: addQty,
              unitPrice: item.unitPrice || null,
              totalValue: item.totalPrice || null,
              stockBefore: beforeQty,
              stockAfter: afterQty,
              notes: `Inbound by receipt ${receipt.code}`,
              recordedBy: adminId || null,
              recordedAt: new Date(),
            },
            { transaction: t }
          );

          const createdUnits = await createEquipmentUnits(
            {
              gymId: receipt.gymId,
              equipmentId,
              quantity: addQty,
              notes: `Inbound receipt ${receipt.code}`,
            },
            t
          );

          await logEquipmentUnitEvents(
            createdUnits.map((unit) => ({
              equipmentUnitId: unit.id,
              equipmentId,
              gymId: receipt.gymId,
              eventType: "created",
              referenceType: "receipt",
              referenceId: receipt.id,
              performedBy: adminId || null,
              notes: `Nhập kho qua phiếu ${receipt.code}`,
              metadata: {
                receiptCode: receipt.code,
                purchaseOrderId: receipt.purchaseOrderId || null,
                source: "purchase_workflow_receipt",
              },
              eventAt: receipt.receiptDate || new Date(),
            })),
            { transaction: t }
          );

          if (po) {
            const poi = (po.items || []).find((x) => String(x.equipmentId) === String(equipmentId));
            if (poi) {
              poi.receivedQuantity = Number(poi.receivedQuantity || 0) + addQty;
              await poi.save({ transaction: t });
            }
          }
        }

        if (po) {
          await po.reload({
            include: [{ model: PurchaseOrderItem, as: "items" }],
            transaction: t,
            lock: t.LOCK.UPDATE,
          });

          const items = po.items || [];
          const allDone = items.every(
            (x) => Number(x.receivedQuantity || 0) >= Number(x.quantity || 0)
          );
          const anyRecv = items.some((x) => Number(x.receivedQuantity || 0) > 0);

          const txs = await findEquipmentPurchaseTxsForPO(po.id, t);
          const paid = sumCompletedPayments(txs);
          const totalAmt = Number(po.totalAmount || 0);

          const oldPO = po.toJSON();

          if (allDone) {
            po.status = paid >= totalAmt - EPS ? "completed" : "received";
          } else if (anyRecv) {
            po.status = "partially_received";
          }

          await po.save({ transaction: t });

          await createAudit(
            {
              userId: adminId,
              action: "PO_STATUS_AFTER_RECEIPT",
              tableName: "purchaseorder",
              recordId: po.id,
              oldValues: oldPO,
              newValues: po.toJSON(),
              req,
            },
            t
          );

          if (po.status === "received" && paid < totalAmt - EPS) {
            poAwaitingFinalPayment = {
              id: po.id,
              code: po.code || String(po.id),
              remaining: totalAmt - paid,
            };
          }
        }
      }

      await createAudit(
        {
          userId: adminId,
          action: "RECEIPT_COMPLETED",
          tableName: "receipt",
          recordId: receipt.id,
          oldValues: oldR,
          newValues: receipt.toJSON(),
          req,
        },
        t
      );

      if (poAwaitingFinalPayment) {
        const snap = poAwaitingFinalPayment;
        t.afterCommit(async () => {
          try {
            await realtimeService.notifyAdministrators({
              title: "Mua sắm — chờ thanh toán cuối",
              message: `PO ${snap.code}: đã nhận đủ hàng, còn ${Number(snap.remaining).toLocaleString("vi-VN")}đ — ghi nhận thanh toán (tab Thanh toán).`,
              notificationType: "admin_procurement_po_awaits_final_payment",
              relatedType: "purchase_order",
              relatedId: snap.id,
            });
          } catch (e) {
            console.error("[adminPurchaseWorkflow] notify admins final payment:", e?.message || e);
          }
        });
      }

      return receipt;
    });
  }

  /* ========================= PAYMENTS (Transaction) ========================= */

  // helper: build where condition for metadata.purchaseOrderId (JSON) with fallback
  _buildPOPaymentWhere(poId) {
    // primary (MySQL JSON)
    const jsonCond = sequelize.where(sequelize.json("metadata.purchaseOrderId"), poId);
    return {
      transactionType: "equipment_purchase",
      [Op.and]: [jsonCond],
    };
  }

  async getPOPayments(purchaseOrderId) {
    const poId = toInt(purchaseOrderId, purchaseOrderId);

    // Try JSON query first
    try {
      const rows = await Transaction.findAll({
        where: this._buildPOPaymentWhere(poId),
        order: [["createdAt", "DESC"]],
      });
      return { data: rows };
    } catch (e) {
      // Fallback: LIKE (works even if JSON query not supported)
      const rows = await Transaction.findAll({
        where: {
          transactionType: "equipment_purchase",
          metadata: { [Op.like]: `%\"purchaseOrderId\":${poId}%` },
        },
        order: [["createdAt", "DESC"]],
      });
      return { data: rows };
    }
  }

  async createPOPayment(purchaseOrderId, body, adminId, req) {
    return sequelize.transaction(async (t) => {
      const poId = toInt(purchaseOrderId, purchaseOrderId);
      const po = await PurchaseOrder.findByPk(poId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!po) throw new Error("PurchaseOrder not found");
      if (po.status === "cancelled") throw new Error("Cannot add payment for cancelled PO");
      if (po.status === "draft") throw new Error("PO đang nháp — duyệt PO (chờ cọc) trước khi thanh toán");

      const amount = Number(body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount");

      const paymentStatus = String(body?.paymentStatus || body?.status || "completed").toLowerCase();
      if (paymentStatus !== "completed") {
        throw new Error("Flow mua sắm chỉ ghi nhận paymentStatus completed tại bước này");
      }

      const paymentMethod = String(body?.paymentMethod || "manual");
      const phase = String(body?.paymentPhase || "").toLowerCase();

      const existing = await findEquipmentPurchaseTxsForPO(poId, t);
      const paid = sumCompletedPayments(existing);
      const poTotal = Number(po.totalAmount || 0);
      const remaining = Math.max(0, poTotal - paid);

      if (remaining <= 0) {
        throw new Error("PO has been fully paid. Cannot add more payments.");
      }
      if (amount > remaining) {
        throw new Error(`Amount exceeds remaining. Remaining = ${remaining}`);
      }

      let paymentPhaseMeta = "deposit";

      if (po.status === "deposit_pending") {
        const ph = phase || "deposit";
        if (ph !== "deposit") {
          throw new Error('Khi chờ cọc 30%, paymentPhase phải là "deposit"');
        }
        const depLabeled = sumDepositPhasePayments(existing);
        if (depLabeled + amount > poTotal * 0.3 + EPS) {
          throw new Error(`Tổng thanh toán loại cọc không được vượt 30% PO (tối đa ${(poTotal * 0.3).toFixed(2)})`);
        }
        paymentPhaseMeta = "deposit";
      } else if (po.status === "received") {
        const ph = phase || "final";
        if (ph !== "final") {
          throw new Error('Sau khi nhận đủ hàng, paymentPhase phải là "final"');
        }
        paymentPhaseMeta = "final";
      } else {
        throw new Error(
          `Không ghi nhận thanh toán ở trạng thái "${po.status}". Cọc: deposit_pending. Phần còn lại: received / final_payment_pending.`
        );
      }

      const tx = await Transaction.create(
        {
          transactionCode: genCode("TX"),
          gymId: po.gymId,
          amount,
          transactionType: "equipment_purchase",
          paymentMethod,
          paymentStatus,
          description: `Payment for PO ${po.code} (${paymentPhaseMeta})`,
          metadata: {
            purchaseOrderId: po.id,
            purchaseOrderCode: po.code,
            paymentPhase: paymentPhaseMeta,
          },
          transactionDate: new Date(),
          processedBy: adminId || null,
        },
        { transaction: t }
      );

      await createAudit(
        {
          userId: adminId,
          action: "PO_PAYMENT_CREATED",
          tableName: "transaction",
          recordId: tx.id,
          oldValues: null,
          newValues: tx.toJSON(),
          req,
        },
        t
      );

      const txsAfter = await findEquipmentPurchaseTxsForPO(poId, t);

      if (po.status === "deposit_pending" && depositRequirementMet(po.totalAmount, txsAfter)) {
        const oldPO = po.toJSON();
        po.status = "deposit_paid";
        await po.save({ transaction: t });
        await createAudit(
          {
            userId: adminId,
            action: "PO_DEPOSIT_PAID",
            tableName: "purchaseorder",
            recordId: po.id,
            oldValues: oldPO,
            newValues: po.toJSON(),
            req,
          },
          t
        );
      }

      const paidAfter = sumCompletedPayments(txsAfter);
      const items = await PurchaseOrderItem.findAll({
        where: { purchaseOrderId: po.id },
        transaction: t,
      });
      const allReceived = items.every((x) => Number(x.receivedQuantity || 0) >= Number(x.quantity || 0));
      if (allReceived && paidAfter >= poTotal - EPS) {
        const oldPO = po.toJSON();
        po.status = "completed";
        await po.save({ transaction: t });
        await createAudit(
          {
            userId: adminId,
            action: "PO_COMPLETED",
            tableName: "purchaseorder",
            recordId: po.id,
            oldValues: oldPO,
            newValues: po.toJSON(),
            req,
          },
          t
        );
      }

      const remainingAfter = Math.max(0, poTotal - paidAfter);
      await createNotification(
        {
          userId: po.requestedBy,
          title: "Payment recorded",
          message: `Đã ghi nhận thanh toán ${amount.toLocaleString("vi-VN")}đ cho PO ${po.code}. Còn lại: ${remainingAfter.toLocaleString("vi-VN")}đ.`,
          notificationType: "payment",
          relatedType: "purchaseorder",
          relatedId: po.id,
        },
        t
      );

      return tx;
    });
  }

  /* ========================= PURCHASE REQUESTS (owner → admin) ========================= */

  async getPurchaseRequests(query) {
    const { page, limit, offset } = paging(query);
    const where = {};
    if (query.status && query.status !== "all") where.status = query.status;
    if (query.gymId && query.gymId !== "all") where.gymId = toInt(query.gymId, query.gymId);
    if (query.q && String(query.q).trim()) {
      const q = String(query.q).trim();
      where[Op.or] = [{ code: { [Op.like]: `%${q}%` } }, { note: { [Op.like]: `%${q}%` } }];
    }

    const { rows, count } = await PurchaseRequest.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: [
        { model: Gym, as: "gym", attributes: ["id", "name"] },
        { model: Equipment, as: "equipment", attributes: ["id", "name", "code", "minStockLevel"] },
        { model: Supplier, as: "expectedSupplier", attributes: ["id", "name"] },
        { model: User, as: "requester", attributes: ["id", "username", "email"] },
        { model: Quotation, as: "quotation", attributes: ["id", "code", "status"] },
      ],
    });
    return {
      data: rows.map((row) => {
        const json = row.toJSON ? row.toJSON() : row;
        const snapshot = json.stockSnapshot || null;
        return {
          ...json,
          fulfillmentPlan: snapshot?.fulfillmentPlan || computeFulfillmentPlan(json.quantity, snapshot),
        };
      }),
      meta: { page, limit, total: count },
    };
  }

  async getEquipmentSalesTransactions(query) {
    const { page, limit, offset } = paging(query || {});
    const where = {
      transactionType: "equipment_purchase",
    };

    const keyword = String(query?.q || "").trim();

    const shouldLoadAll = Boolean(keyword);
    const { rows, count } = await Transaction.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      ...(shouldLoadAll ? {} : { limit, offset }),
    });

    const txRows = rows.map((row) => row.toJSON());
    const prIds = Array.from(
      new Set(
        txRows
          .map((row) => Number(row?.metadata?.purchaseRequestId || 0))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    const requests = prIds.length
      ? await PurchaseRequest.findAll({
          where: { id: { [Op.in]: prIds } },
          include: [
            { model: User, as: "requester", attributes: ["id", "username", "email"] },
            { model: Equipment, as: "equipment", attributes: ["id", "name", "code"] },
            { model: Gym, as: "gym", attributes: ["id", "name"] },
          ],
        })
      : [];
    const requestById = new Map(requests.map((r) => [Number(r.id), r]));

    let data = txRows.map((tx) => {
      const prId = Number(tx?.metadata?.purchaseRequestId || 0);
      const pr = requestById.get(prId) || null;
      const ownerName = pr?.requester?.username || pr?.requester?.email || "-";
      return {
        id: tx.id,
        transactionCode: tx.transactionCode,
        amount: Number(tx.amount || 0),
        paymentStatus: tx.paymentStatus,
        paymentMethod: tx.paymentMethod,
        transactionDate: tx.transactionDate || tx.createdAt,
        createdAt: tx.createdAt,
        purchaseRequestCode: pr?.code || tx?.metadata?.purchaseRequestCode || "-",
        owner: ownerName,
        equipmentName: pr?.equipment?.name || "-",
        gymName: pr?.gym?.name || "-",
        quantity: Number(pr?.quantity || 0),
      };
    });

    if (keyword) {
      const qLower = keyword.toLowerCase();
      data = data.filter((item) =>
        [
          item.transactionCode,
          item.purchaseRequestCode,
          item.owner,
          item.equipmentName,
          item.gymName,
          String(item.quantity || ""),
          String(item.amount || ""),
          String(item.paymentStatus || ""),
        ]
          .join(" ")
          .toLowerCase()
          .includes(qLower)
      );
    }

    const total = keyword ? data.length : count;
    const paged = shouldLoadAll ? data.slice(offset, offset + limit) : data;
    return { data: paged, meta: { page, limit, total } };
  }

  async getPurchaseRequestDetail(id) {
    const pr = await PurchaseRequest.findByPk(id, {
      include: [
        { model: Gym, as: "gym", attributes: ["id", "name"] },
        { model: Equipment, as: "equipment", attributes: ["id", "name", "code", "minStockLevel"] },
        { model: Supplier, as: "expectedSupplier", attributes: ["id", "name", "code", "email", "phone"] },
        { model: User, as: "requester", attributes: ["id", "username", "email"] },
        { model: Quotation, as: "quotation", attributes: ["id", "code", "status", "totalAmount"] },
      ],
    });
    if (!pr) throw new Error("Purchase request not found");
    return {
      ...pr.toJSON(),
      fulfillmentPlan: pr.stockSnapshot?.fulfillmentPlan || computeFulfillmentPlan(pr.quantity, pr.stockSnapshot),
    };
  }

  async approvePurchaseRequest(requestId, adminId, req) {
    return sequelize.transaction(async (t) => {
      const pr = await PurchaseRequest.findByPk(requestId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!pr) throw new Error("Purchase request not found");
      if (pr.status !== "submitted") throw new Error("Only submitted requests can be approved");

      const old = pr.toJSON();
      pr.status = "approved_waiting_payment";
      await pr.save({ transaction: t });

      const amount = Number(pr.quantity || 0) * Number(pr.expectedUnitPrice || 0);
      await Transaction.create(
        {
          transactionCode: genCode("TX"),
          gymId: pr.gymId,
          amount,
          transactionType: "equipment_purchase",
          paymentMethod: "payos",
          paymentStatus: "pending",
          description: `Payment for purchase request ${pr.code}`,
          metadata: {
            purchaseRequestId: pr.id,
            purchaseRequestCode: pr.code,
            source: "direct_purchase_request",
          },
          transactionDate: new Date(),
          processedBy: pr.requestedBy || null,
        },
        { transaction: t }
      );

      await createAudit(
        {
          userId: adminId,
          action: "PURCHASE_REQUEST_APPROVED",
          tableName: "purchaserequest",
          recordId: pr.id,
          oldValues: old,
          newValues: pr.toJSON(),
          req,
        },
        t
      );

      await createNotification(
        {
          userId: pr.requestedBy,
          title: "Yêu cầu mua đã được duyệt",
          message: `${pr.code} đã được duyệt. Vui lòng thanh toán để admin xử lý giao hàng.`,
          notificationType: "purchase_request",
          relatedType: "purchaserequest",
          relatedId: pr.id,
        },
        t
      );

      return pr;
    });
  }

  async confirmPurchaseRequestPaymentAndShip(requestId, adminId, req) {
    return sequelize.transaction(async (t) => {
      const pr = await PurchaseRequest.findByPk(requestId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!pr) throw new Error("Purchase request not found");
      if (pr.status !== "paid_waiting_admin_confirm") {
        throw new Error("Request must be paid_waiting_admin_confirm");
      }

      const neededQty = Number(pr.quantity || 0);
      if (neededQty <= 0) throw new Error("Invalid request quantity");

      const centralGymCount = await Gym.count({ where: { ownerId: null }, transaction: t });
      const stocks = await EquipmentStock.findAll({
        where: { equipmentId: pr.equipmentId },
        include: centralGymCount
          ? [{ model: Gym, as: "gym", attributes: ["id", "ownerId"], required: true, where: { ownerId: null } }]
          : [],
        order: [["availableQuantity", "DESC"], ["id", "ASC"]],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      let remaining = neededQty;
      for (const st of stocks) {
        if (remaining <= 0) break;
        const avail = Number(st.availableQuantity || 0);
        if (avail <= 0) continue;
        const take = Math.min(avail, remaining);
        const before = Number(st.quantity || 0);
        st.quantity = Math.max(0, before - take);
        st.availableQuantity = Math.max(0, Number(st.availableQuantity || 0) - take);
        await st.save({ transaction: t });

        await Inventory.create(
          {
            gymId: st.gymId,
            equipmentId: pr.equipmentId,
            transactionType: "sale",
            transactionId: pr.id,
            transactionCode: pr.code,
            quantity: -take,
            unitPrice: pr.expectedUnitPrice || 0,
            totalValue: Number(pr.expectedUnitPrice || 0) * take,
            stockBefore: before,
            stockAfter: Number(st.quantity || 0),
            notes: `Xuất kho bán cho yêu cầu ${pr.code}`,
            recordedBy: adminId || null,
            recordedAt: new Date(),
          },
          { transaction: t }
        );
        remaining -= take;
      }
      if (remaining > 0) throw new Error("Admin stock is not enough to ship this request");

      const old = pr.toJSON();
      pr.status = "shipping";
      await pr.save({ transaction: t });

      await createAudit(
        {
          userId: adminId,
          action: "PURCHASE_REQUEST_SHIPPING",
          tableName: "purchaserequest",
          recordId: pr.id,
          oldValues: old,
          newValues: pr.toJSON(),
          req,
        },
        t
      );

      await createNotification(
        {
          userId: pr.requestedBy,
          title: "Admin đã nhận tiền, đang chuyển thiết bị",
          message: `${pr.code} đã được xác nhận thanh toán và đang chuyển thiết bị cho bạn.`,
          notificationType: "purchase_request",
          relatedType: "purchaserequest",
          relatedId: pr.id,
        },
        t
      );

      return pr;
    });
  }

  async rejectPurchaseRequest(requestId, body, adminId, req) {
    return sequelize.transaction(async (t) => {
      const pr = await PurchaseRequest.findByPk(requestId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!pr) throw new Error("Purchase request not found");
      if (pr.status !== "submitted") throw new Error("Only submitted requests can be rejected");

      const reason = String(body?.rejectionReason || body?.reason || "").trim();
      if (!reason) throw new Error("Missing rejectionReason");

      const old = pr.toJSON();
      pr.status = "rejected";
      pr.adminRejectionNote = reason;
      await pr.save({ transaction: t });

      await createAudit(
        {
          userId: adminId,
          action: "PURCHASE_REQUEST_REJECTED",
          tableName: "purchaserequest",
          recordId: pr.id,
          oldValues: old,
          newValues: pr.toJSON(),
          req,
        },
        t
      );

      await createNotification(
        {
          userId: pr.requestedBy,
          title: "Yêu cầu mua sắm bị từ chối",
          message: `${pr.code}: ${reason}`,
          notificationType: "purchase_request",
          relatedType: "purchaserequest",
          relatedId: pr.id,
        },
        t
      );

      return pr;
    });
  }

  async convertPurchaseRequestToQuotation(requestId, body, adminId, req) {
    return sequelize.transaction(async (t) => {
      const pr = await PurchaseRequest.findByPk(requestId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!pr) throw new Error("Purchase request not found");
      if (pr.status !== "submitted") throw new Error("Only submitted requests can be converted");

      const supplierId = Number(body?.supplierId || pr.expectedSupplierId);
      if (!supplierId) throw new Error("supplierId is required (or set expected supplier on request)");

      const supplier = await Supplier.findByPk(supplierId, { transaction: t });
      if (!supplier) throw new Error("Supplier not found");

      const unitPrice = Number(pr.expectedUnitPrice || 0);
      const requestedQty = Number(pr.quantity || 0);
      const availableQty = Math.max(
        0,
        Number(
          pr.availableQty ??
            pr.stockSnapshot?.availableQuantity ??
            pr.stockSnapshot?.fulfillmentPlan?.availableQuantity ??
            0
        )
      );
      const issueQty = Math.min(requestedQty, availableQty);
      const purchaseQty = Math.max(requestedQty - availableQty, 0);
      const totalAmount = purchaseQty * unitPrice;
      const payableAmount = totalAmount;
      const depositAmount = payableAmount * 0.3;
      const remainingAmount = payableAmount - depositAmount;

      if (issueQty > 0) {
        let stock = await EquipmentStock.findOne({
          where: { gymId: pr.gymId, equipmentId: pr.equipmentId },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        const beforeQty = Number(stock?.quantity || 0);
        const beforeAvail = Number(stock?.availableQuantity ?? stock?.quantity ?? 0);
        if (beforeAvail < issueQty) {
          throw new Error(
            `Current available stock is ${beforeAvail}, cannot issue ${issueQty}. Please refresh and submit again.`
          );
        }
        const afterQty = Math.max(0, beforeQty - issueQty);
        const afterAvail = Math.max(0, beforeAvail - issueQty);
        if (!stock) {
          stock = await EquipmentStock.create(
            {
              gymId: pr.gymId,
              equipmentId: pr.equipmentId,
              quantity: 0,
              availableQuantity: 0,
              reservedQuantity: 0,
            },
            { transaction: t }
          );
        }
        stock.quantity = afterQty;
        stock.availableQuantity = afterAvail;
        await stock.save({ transaction: t });

        await Inventory.create(
          {
            gymId: pr.gymId,
            equipmentId: pr.equipmentId,
            transactionType: "adjustment",
            transactionId: pr.id,
            transactionCode: pr.code,
            quantity: -issueQty,
            unitPrice: null,
            totalValue: null,
            stockBefore: beforeAvail,
            stockAfter: afterAvail,
            notes: `Issued from stock for purchase request ${pr.code}`,
            recordedBy: adminId || null,
            recordedAt: new Date(),
          },
          { transaction: t }
        );
      }

      pr.availableQty = availableQty;
      pr.issueQty = issueQty;
      pr.purchaseQty = purchaseQty;
      pr.payableAmount = payableAmount;
      pr.depositAmount = depositAmount;
      pr.remainingAmount = remainingAmount;

      if (purchaseQty <= 0) {
        pr.status = "fulfilled_from_stock";
        await pr.save({ transaction: t });
        return {
          purchaseRequestId: pr.id,
          status: pr.status,
          requestedQty,
          availableQty,
          issueQty,
          purchaseQty,
          unitPrice,
          payableAmount,
          depositAmount,
          remainingAmount,
        };
      }

      const count = await Quotation.count({ transaction: t });
      const code = `QUO-${Date.now()}-${count + 1}`;

      const quotation = await Quotation.create(
        {
          code,
          gymId: pr.gymId,
          supplierId,
          requestedBy: pr.requestedBy,
          status: "pending",
          notes: body?.notes || pr.note || `Từ yêu cầu ${pr.code}`,
          totalAmount,
          purchaseRequestId: pr.id,
        },
        { transaction: t }
      );

      await QuotationItem.create(
        {
          quotationId: quotation.id,
          equipmentId: pr.equipmentId,
          quantity: purchaseQty,
          unitPrice,
          totalPrice: totalAmount,
        },
        { transaction: t }
      );

      pr.status = "converted";
      pr.quotationId = quotation.id;
      await pr.save({ transaction: t });

      await createAudit(
        {
          userId: adminId,
          action: "PURCHASE_REQUEST_CONVERTED",
          tableName: "purchaserequest",
          recordId: pr.id,
          oldValues: null,
          newValues: { quotationId: quotation.id, quotationCode: quotation.code },
          req,
        },
        t
      );

      await createNotification(
        {
          userId: pr.requestedBy,
          title: "Yêu cầu mua sắm đã được tiếp nhận",
          message: `Đã tạo báo giá ${quotation.code} từ ${pr.code}.`,
          notificationType: "quotation",
          relatedType: "quotation",
          relatedId: quotation.id,
        },
        t
      );

      return quotation;
    });
  }

  // Enterprise: timeline for a PO (audits + receipts + payments)
  async getPOTimeline(purchaseOrderId) {
    const poId = toInt(purchaseOrderId, purchaseOrderId);
    const po = await PurchaseOrder.findByPk(poId);
    if (!po) throw new Error("PurchaseOrder not found");

    const receipts = await Receipt.findAll({
      where: { purchaseOrderId: poId },
      order: [["createdAt", "DESC"]],
    });

    const paymentsRes = await this.getPOPayments(poId);
    const payments = paymentsRes?.data || [];

    const receiptIds = receipts.map((r) => r.id);

    const audits = await AuditLog.findAll({
      where: {
        [Op.or]: [
          { tableName: "purchaseorder", recordId: poId },
          receiptIds.length ? { tableName: "receipt", recordId: { [Op.in]: receiptIds } } : null,
          // payment audit logs are stored under tableName=transaction, but recordId is tx.id
          payments.length ? { tableName: "transaction", recordId: { [Op.in]: payments.map((x) => x.id) } } : null,
        ].filter(Boolean),
      },
      include: [{ model: User, attributes: ["id", "username", "email"] }],
      order: [["createdAt", "DESC"]],
    });

    const events = [];

    // audits
    for (const a of audits || []) {
      events.push({
        kind: "audit",
        at: a.createdAt,
        action: a.action,
        tableName: a.tableName,
        recordId: a.recordId,
        actor: a.User ? { id: a.User.id, username: a.User.username, email: a.User.email } : null,
        meta: { ip: a.ipAddress, ua: a.userAgent },
      });
    }

    // receipts (as quick events)
    for (const r of receipts || []) {
      events.push({
        kind: "receipt",
        at: r.createdAt,
        code: r.code,
        status: r.status,
        totalValue: r.totalValue,
        id: r.id,
      });
    }

    // payments
    for (const tx of payments || []) {
      events.push({
        kind: "payment",
        at: tx.createdAt || tx.transactionDate || null,
        code: tx.transactionCode,
        amount: tx.amount,
        method: tx.paymentMethod,
        status: tx.paymentStatus,
        id: tx.id,
      });
    }

    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return { data: events };
  }
}

module.exports = new AdminPurchaseWorkflowService();
