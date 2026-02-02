// src/service/adminPurchaseWorkflowService.js
const { Op } = require("sequelize");
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
} = require("../models");

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
  return Notification.create(
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

    return { data: rows, meta: { page, limit, total: count } };
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
          status: "pending",
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

    return { data: rows, meta: { page, limit, total: count } };
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
      if (po.status !== "pending") throw new Error("Only pending PO can be approved");

      const oldPO = po.toJSON();

      po.status = "approved";
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
      if (po.status !== "approved") throw new Error("Only approved PO can be set to ordered");

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
      if (po.status === "delivered" || po.status === "cancelled") throw new Error("PO cannot be cancelled");

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

    return { data: rows, meta: { page, limit, total: count } };
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

  async createInboundReceiptFromPO(purchaseOrderId, adminId, req) {
    return sequelize.transaction(async (t) => {
      const po = await PurchaseOrder.findByPk(purchaseOrderId, {
        include: [{ model: PurchaseOrderItem, as: "items" }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!po) throw new Error("PurchaseOrder not found");
      if (!(po.status === "approved" || po.status === "ordered"))
        throw new Error("PO must be approved/ordered to create inbound receipt");

      const receipt = await Receipt.create(
        {
          code: genCode("RC"),
          purchaseOrderId: po.id,
          type: "inbound",
          gymId: po.gymId,
          processedBy: adminId || null,
          receiptDate: new Date(),
          status: "pending",
          totalValue: po.totalAmount || 0,
          notes: `Inbound from PO ${po.code}`,
        },
        { transaction: t }
      );

      for (const it of po.items || []) {
        await ReceiptItem.create(
          {
            receiptId: receipt.id,
            equipmentId: it.equipmentId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
            notes: it.notes || null,
          },
          { transaction: t }
        );
      }

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

          if (po) {
            const poi = (po.items || []).find((x) => String(x.equipmentId) === String(equipmentId));
            if (poi) {
              poi.receivedQuantity = Number(poi.receivedQuantity || 0) + addQty;
              await poi.save({ transaction: t });
            }
          }
        }

        if (po) {
          const allDone = (po.items || []).every(
            (x) => Number(x.receivedQuantity || 0) >= Number(x.quantity || 0)
          );
          if (allDone) {
            const oldPO = po.toJSON();
            po.status = "delivered";
            await po.save({ transaction: t });

            await createAudit(
              {
                userId: adminId,
                action: "PO_DELIVERED",
                tableName: "purchaseorder",
                recordId: po.id,
                oldValues: oldPO,
                newValues: po.toJSON(),
                req,
              },
              t
            );
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

      const amount = Number(body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount");

      const status = String(body?.status || "completed"); // completed/pending/failed
      const paymentMethod = String(body?.paymentMethod || "manual");

      const poTotal = Number(po.totalAmount || 0);

      // ===== LEVEL 2 RULE (server-side) =====
      // Sum paid (completed only)
      let paid = 0;
      try {
        const existing = await Transaction.findAll({
          where: this._buildPOPaymentWhere(poId),
          transaction: t,
          lock: t.LOCK.SHARE,
        });
        paid = (existing || [])
          .filter((x) => String(x.paymentStatus || "").toLowerCase() === "completed")
          .reduce((s, x) => s + Number(x.amount || 0), 0);
      } catch (e) {
        const existing = await Transaction.findAll({
          where: {
            transactionType: "equipment_purchase",
            metadata: { [Op.like]: `%\"purchaseOrderId\":${poId}%` },
          },
          transaction: t,
          lock: t.LOCK.SHARE,
        });
        paid = (existing || [])
          .filter((x) => String(x.paymentStatus || "").toLowerCase() === "completed")
          .reduce((s, x) => s + Number(x.amount || 0), 0);
      }

      const remaining = Math.max(0, poTotal - paid);

      if (remaining <= 0) {
        throw new Error("PO has been fully paid. Cannot add more payments.");
      }
      if (amount > remaining) {
        throw new Error(`Amount exceeds remaining. Remaining = ${remaining}`);
      }

      const tx = await Transaction.create(
        {
          transactionCode: genCode("TX"),
          gymId: po.gymId,
          amount,
          transactionType: "equipment_purchase",
          paymentMethod,
          paymentStatus: status,
          description: `Payment for PO ${po.code}`,
          metadata: { purchaseOrderId: po.id, purchaseOrderCode: po.code },
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

      await createNotification(
        {
          userId: po.requestedBy,
          title: "Payment recorded",
          message: `Đã ghi nhận thanh toán ${amount.toLocaleString("vi-VN")}đ cho PO ${
            po.code
          }. Remaining: ${(remaining - amount).toLocaleString("vi-VN")}đ.`,
          notificationType: "payment",
          relatedType: "purchaseorder",
          relatedId: po.id,
        },
        t
      );

      return tx;
    });
  }
}

module.exports = new AdminPurchaseWorkflowService();
