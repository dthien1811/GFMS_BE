import db from "../../models";
import { Op } from "sequelize";
import procurementStockHelper from "../procurementStockHelper";
import realtimeService from "../realtime.service";

const { buildStockContext, computeFulfillmentPlan, validateRequestReason } = procurementStockHelper;

const {
  Supplier,
  Quotation,
  QuotationItem,
  PurchaseOrder,
  PurchaseOrderItem,
  Receipt,
  ReceiptItem,
  Equipment,
  EquipmentStock,
  Gym,
  PurchaseRequest,
  Transaction,
  sequelize,
} = db;

const parsePaging = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const ensure = (condition, message, statusCode = 400) => {
  if (!condition) throw { message, statusCode };
};

const parseTxMetadata = (meta) => {
  if (!meta) return {};
  if (typeof meta === "string") {
    try {
      return JSON.parse(meta);
    } catch (e) {
      return {};
    }
  }
  return meta;
};

function buildPOSummary(poId, totalAmount, txs = []) {
  const poTxs = (txs || []).filter(
    (x) => Number(parseTxMetadata(x.metadata)?.purchaseOrderId) === Number(poId)
  );
  const paidAmount = poTxs
    .filter((x) => String(x.paymentStatus || "").toLowerCase() === "completed")
    .reduce((s, x) => s + Number(x.amount || 0), 0);
  const depositPaidAmount = poTxs
    .filter(
      (x) =>
        String(x.paymentStatus || "").toLowerCase() === "completed" &&
        String(parseTxMetadata(x.metadata)?.paymentPhase || "").toLowerCase() === "deposit"
    )
    .reduce((s, x) => s + Number(x.amount || 0), 0);
  const total = Number(totalAmount || 0);
  const depositRequired = total * 0.3;
  const remainingAmount = Math.max(0, total - paidAmount);
  const paymentStage =
    paidAmount <= 0
      ? "not_started"
      : paidAmount >= total
      ? "fully_paid"
      : depositPaidAmount >= depositRequired
      ? "deposit_completed"
      : "partially_paid";
  return {
    paidAmount,
    depositRequired,
    depositPaidAmount,
    remainingAmount,
    paymentStage,
    transactions: poTxs.map((x) => ({ ...x.toJSON(), metadata: parseTxMetadata(x.metadata) })),
  };
}

const ownerPurchaseService = {
  // ===== SUPPLIERS =====
  async getSuppliers(ownerUserId, query) {
    const { page, limit, offset } = parsePaging(query);
    const { q, isActive } = query;

    const where = {};
    if (isActive !== undefined) {
      where.isActive = isActive === "true" || isActive === true;
    }
    if (q) {
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { code: { [Op.like]: `%${q}%` } },
        { email: { [Op.like]: `%${q}%` } },
      ];
    }

    const { rows, count } = await Supplier.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
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
      meta: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) },
    };
  },

  // ===== QUOTATIONS =====
  async getQuotations(ownerUserId, query) {
    const { page, limit, offset } = parsePaging(query);
    const { status, q } = query;

    // Get owner's gyms
    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => g.id);

    if (gymIds.length === 0) {
      return { data: [], meta: { page, limit, totalItems: 0, totalPages: 0 } };
    }

    const where = { gymId: { [Op.in]: gymIds } };
    if (status && status !== "all") {
      where.status = status;
    }
    if (q) {
      where[Op.or] = [
        { code: { [Op.like]: `%${q}%` } },
        { "$supplier.name$": { [Op.like]: `%${q}%` } },
      ];
    }

    const { rows, count } = await Quotation.findAndCountAll({
      where,
      include: [
        { model: Supplier, as: "supplier", attributes: ["id", "name", "code"] },
        { model: Gym, as: "gym", attributes: ["id", "name"] },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
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
      meta: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) },
    };
  },

  async getQuotationDetail(ownerUserId, quotationId) {
    const quotation = await Quotation.findByPk(quotationId, {
      include: [
        { model: Supplier, as: "supplier", attributes: ["id", "name", "code", "email", "phone"] },
        { model: Gym, as: "gym", attributes: ["id", "name", "ownerId"] },
        {
          model: QuotationItem,
          as: "items",
          attributes: ["id", "equipmentId", "quantity", "unitPrice"],
          include: [{ model: Equipment, as: "equipment", attributes: ["id", "name", "code"] }],
        },
      ],
    });

    ensure(quotation, "Quotation not found", 404);

    // Check authorization
    ensure(quotation.gym?.ownerId === ownerUserId, "Not authorized", 403);

    return quotation;
  },

  async createQuotation(ownerUserId, payload) {
    const { gymId, supplierId, items, notes } = payload;

    ensure(gymId, "gymId is required");
    ensure(supplierId, "supplierId is required");
    ensure(items && Array.isArray(items) && items.length > 0, "items must be non-empty array");

    // Check gym belongs to owner
    const gym = await Gym.findByPk(Number(gymId));
    ensure(gym && gym.ownerId === ownerUserId, "Gym not found or not authorized", 403);

    // Check supplier exists
    const supplier = await Supplier.findByPk(Number(supplierId));
    ensure(supplier, "Supplier not found", 404);

    return sequelize.transaction(async (t) => {
      // Generate code
      const count = await Quotation.count();
      const code = `QUO-${Date.now()}-${count + 1}`;

      // Calculate total amount
      const totalAmount = items.reduce((sum, item) => {
        return sum + (Number(item.quantity) * Number(item.unitPrice || 0));
      }, 0);

      const quotation = await Quotation.create(
        {
          code,
          gymId: Number(gymId),
          supplierId: Number(supplierId),
          requestedBy: ownerUserId,
          status: "pending",
          notes: notes || "",
          totalAmount,
        },
        { transaction: t }
      );

      // Create items
      const quotationItems = items.map((item) => ({
        quotationId: quotation.id,
        equipmentId: Number(item.equipmentId),
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice || 0),
        totalPrice: Number(item.quantity) * Number(item.unitPrice || 0),
      }));

      await QuotationItem.bulkCreate(quotationItems, { transaction: t });

      const gymName = gym?.name || `Gym #${gymId}`;
      t.afterCommit(async () => {
        try {
          await realtimeService.notifyAdministrators({
            title: "Mua sắm — quotation chờ báo giá",
            message: `${quotation.code} · ${gymName} · NCC ${supplier?.name || supplierId} · Cần nhập giá / xử lý báo giá`,
            notificationType: "admin_procurement_quotation_needs_quote",
            relatedType: "quotation",
            relatedId: quotation.id,
          });
        } catch (e) {
          console.error("[owner.purchase] quotation notify:", e?.message || e);
        }
      });

      return quotation;
    });
  },

  // ===== PURCHASE ORDERS =====
  async getPurchaseOrders(ownerUserId, query) {
    const { page, limit, offset } = parsePaging(query);
    const { status, q } = query;

    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => g.id);

    if (gymIds.length === 0) {
      return { data: [], meta: { page, limit, totalItems: 0, totalPages: 0 } };
    }

    const where = { gymId: { [Op.in]: gymIds } };
    if (status && status !== "all") {
      where.status = status;
    }
    if (q) {
      where[Op.or] = [
        { code: { [Op.like]: `%${q}%` } },
        { "$supplier.name$": { [Op.like]: `%${q}%` } },
      ];
    }

    const { rows, count } = await PurchaseOrder.findAndCountAll({
      where,
      include: [
        { model: Supplier, as: "supplier", attributes: ["id", "name", "code"] },
        { model: Gym, as: "gym", attributes: ["id", "name"] },
        { model: Quotation, as: "quotation", attributes: ["id", "code"] },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    const txs = await Transaction.findAll({
      where: {
        transactionType: "equipment_purchase",
        gymId: { [Op.in]: gymIds },
      },
      order: [["createdAt", "DESC"]],
    });

    const data = await Promise.all(
      (rows || []).map(async (row) => {
        const json = row.toJSON ? row.toJSON() : row;
        const paymentSummary = buildPOSummary(json.id, json.totalAmount, txs);
        return {
          ...json,
          paymentSummary,
        };
      })
    );
    return {
      data,
      meta: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) },
    };
  },

  async getPurchaseOrderDetail(ownerUserId, poId) {
    const po = await PurchaseOrder.findByPk(poId, {
      include: [
        { model: Supplier, as: "supplier", attributes: ["id", "name", "code", "email", "phone"] },
        { model: Gym, as: "gym", attributes: ["id", "name", "ownerId"] },
        { model: Quotation, as: "quotation", attributes: ["id", "code"] },
        {
          model: PurchaseOrderItem,
          as: "items",
          attributes: ["id", "equipmentId", "quantity", "unitPrice"],
          include: [{ model: Equipment, as: "equipment", attributes: ["id", "name", "code"] }],
        },
      ],
    });

    ensure(po, "Purchase order not found", 404);
    ensure(po.gym?.ownerId === ownerUserId, "Not authorized", 403);

    const txs = await Transaction.findAll({
      where: {
        transactionType: "equipment_purchase",
        gymId: po.gymId,
      },
      order: [["createdAt", "DESC"]],
    });
    const paymentSummary = buildPOSummary(po.id, po.totalAmount, txs);
    const receipts = await Receipt.findAll({
      where: { purchaseOrderId: po.id },
      include: [{ model: ReceiptItem, as: "items", attributes: ["quantity"] }],
    });
    const receiptSummary = {
      totalReceiptCount: receipts.length,
      completedReceiptCount: receipts.filter((x) => String(x.status) === "completed").length,
      totalReceivedQuantity: receipts.reduce(
        (sum, r) => sum + (r.items || []).reduce((s, it) => s + Number(it.quantity || 0), 0),
        0
      ),
    };
    return {
      ...po.toJSON(),
      paymentSummary,
      receiptSummary,
    };
  },

  // ===== RECEIPTS =====
  async getReceipts(ownerUserId, query) {
    const { page, limit, offset } = parsePaging(query);
    const { status, q } = query;

    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => g.id);

    if (gymIds.length === 0) {
      return { data: [], meta: { page, limit, totalItems: 0, totalPages: 0 } };
    }

    const where = { gymId: { [Op.in]: gymIds } };
    if (status && status !== "all") {
      where.status = status;
    }
    if (q) {
      where[Op.or] = [
        { code: { [Op.like]: `%${q}%` } },
        { "$purchaseOrder.code$": { [Op.like]: `%${q}%` } },
      ];
    }

    const { rows, count } = await Receipt.findAndCountAll({
      where,
      include: [
        { model: Gym, as: "gym", attributes: ["id", "name"] },
        { model: PurchaseOrder, as: "purchaseOrder", attributes: ["id", "code"] },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return {
      data: rows,
      meta: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) },
    };
  },

  async getReceiptDetail(ownerUserId, receiptId) {
    const receipt = await Receipt.findByPk(receiptId, {
      include: [
        { model: Gym, as: "gym", attributes: ["id", "name", "ownerId"] },
        { model: PurchaseOrder, as: "purchaseOrder", attributes: ["id", "code"] },
        {
          model: ReceiptItem,
          as: "items",
          attributes: ["id", "equipmentId", "quantity", "unitPrice"],
          include: [{ model: Equipment, as: "equipment", attributes: ["id", "name", "code"] }],
        },
      ],
    });

    ensure(receipt, "Receipt not found", 404);
    ensure(receipt.gym?.ownerId === ownerUserId, "Not authorized", 403);

    return receipt;
  },

  // ===== PURCHASE REQUESTS (bước 1: nhu cầu từ owner) =====
  async previewPurchaseStock(ownerUserId, query) {
    const gymId = Number(query.gymId);
    const equipmentId = Number(query.equipmentId);
    ensure(gymId && equipmentId, "gymId and equipmentId are required");

    const gym = await Gym.findByPk(gymId);
    ensure(gym && gym.ownerId === ownerUserId, "Gym not found or not authorized", 403);

    const ctx = await buildStockContext(gymId, equipmentId, null);
    ensure(ctx, "Equipment not found", 404);
    const requestedQty = Number(query.requestedQty || query.quantity || 0);
    return { data: { ...ctx, fulfillmentPlan: computeFulfillmentPlan(requestedQty, ctx) } };
  },

  async createPurchaseRequest(ownerUserId, payload) {
    const {
      gymId,
      equipmentId,
      quantity,
      expectedUnitPrice,
      expectedSupplierId,
      reason,
      priority,
      note,
    } = payload;

    ensure(gymId && equipmentId, "gymId and equipmentId are required");
    const qty = Number(quantity);
    ensure(Number.isFinite(qty) && qty > 0, "quantity must be a positive number");

    const gym = await Gym.findByPk(Number(gymId));
    ensure(gym && gym.ownerId === ownerUserId, "Gym not found or not authorized", 403);

    const equipment = await Equipment.findByPk(Number(equipmentId));
    ensure(equipment, "Equipment not found", 404);
    ensure(equipment.status === "active", "Equipment is discontinued", 400);

    if (expectedSupplierId) {
      const sup = await Supplier.findByPk(Number(expectedSupplierId));
      ensure(sup, "Supplier not found", 404);
    }

    return sequelize.transaction(async (t) => {
      const ctx = await buildStockContext(gymId, equipmentId, t);
      const v = validateRequestReason(reason, ctx);
      ensure(v.ok, v.message, 400);

      const count = await PurchaseRequest.count({ transaction: t });
      const code = `PR-${Date.now()}-${count + 1}`;

      const fulfillmentPlan = computeFulfillmentPlan(qty, ctx);
      const availableQty = Number(ctx?.availableQuantity || 0);
      const issueQty = Number(fulfillmentPlan.issueQty || 0);
      const purchaseQty = Number(fulfillmentPlan.purchaseQty || 0);
      const unitPrice = Number(expectedUnitPrice || 0);
      const payableAmount = purchaseQty * unitPrice;
      const depositAmount = payableAmount * 0.3;
      const remainingAmount = payableAmount - depositAmount;

      const pr = await PurchaseRequest.create(
        {
          code,
          gymId: Number(gymId),
          equipmentId: Number(equipmentId),
          expectedSupplierId: expectedSupplierId ? Number(expectedSupplierId) : null,
          requestedBy: ownerUserId,
          quantity: qty,
          expectedUnitPrice: Number(expectedUnitPrice || 0),
          availableQty,
          issueQty,
          purchaseQty,
          payableAmount,
          depositAmount,
          remainingAmount,
          reason: String(reason || "").trim(),
          priority: String(priority || "normal").trim() || "normal",
          note: note ? String(note) : null,
          status: "submitted",
          stockSnapshot: { ...ctx, fulfillmentPlan },
        },
        { transaction: t }
      );

      const gymName = gym?.name || `Gym #${gymId}`;
      const equipLabel = equipment?.name || equipment?.code || `Equipment #${equipmentId}`;
      t.afterCommit(async () => {
        try {
          await realtimeService.notifyAdministrators({
            title: "Mua sắm — yêu cầu mua mới",
            message: `${pr.code} · ${gymName} · ${equipLabel} · SL ${qty} · Cần xử lý báo giá / chuyển quotation`,
            notificationType: "admin_procurement_pr_submitted",
            relatedType: "purchase_request",
            relatedId: pr.id,
          });
        } catch (e) {
          console.error("[owner.purchase] PR notify:", e?.message || e);
        }
      });

      return { ...pr.toJSON(), stockSnapshot: { ...ctx, fulfillmentPlan } };
    });
  },

  async getPurchaseRequests(ownerUserId, query) {
    const { page, limit, offset } = parsePaging(query);
    const { status, q } = query;

    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => g.id);

    if (gymIds.length === 0) {
      return { data: [], meta: { page, limit, totalItems: 0, totalPages: 0 } };
    }

    const where = { gymId: { [Op.in]: gymIds } };
    if (status && status !== "all") {
      where.status = status;
    }
    if (q) {
      where[Op.or] = [
        { code: { [Op.like]: `%${q}%` } },
        { note: { [Op.like]: `%${q}%` } },
      ];
    }

    const { rows, count } = await PurchaseRequest.findAndCountAll({
      where,
      include: [
        { model: Gym, as: "gym", attributes: ["id", "name"] },
        { model: Equipment, as: "equipment", attributes: ["id", "name", "code"] },
        { model: Supplier, as: "expectedSupplier", attributes: ["id", "name", "code"] },
        { model: Quotation, as: "quotation", attributes: ["id", "code", "status"] },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return {
      data: rows,
      meta: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) },
    };
  },

  async getPurchaseRequestDetail(ownerUserId, requestId) {
    const pr = await PurchaseRequest.findByPk(requestId, {
      include: [
        { model: Gym, as: "gym", attributes: ["id", "name", "ownerId"] },
        { model: Equipment, as: "equipment", attributes: ["id", "name", "code", "minStockLevel"] },
        { model: Supplier, as: "expectedSupplier", attributes: ["id", "name", "code", "email", "phone"] },
        { model: Quotation, as: "quotation", attributes: ["id", "code", "status", "totalAmount"] },
      ],
    });

    ensure(pr, "Purchase request not found", 404);
    ensure(pr.gym?.ownerId === ownerUserId, "Not authorized", 403);

    return {
      ...pr.toJSON(),
      fulfillmentPlan: pr.stockSnapshot?.fulfillmentPlan || computeFulfillmentPlan(pr.quantity, pr.stockSnapshot),
    };
  },

  // ===== PROCUREMENT PAYMENTS =====
  async getProcurementPayments(ownerUserId, query) {
    const { page, limit, offset } = parsePaging(query);
    const { q, status } = query;

    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => g.id);

    if (gymIds.length === 0) {
      return { data: [], meta: { page, limit, totalItems: 0, totalPages: 0 } };
    }

    const where = {
      gymId: { [Op.in]: gymIds },
      transactionType: "equipment_purchase",
    };

    if (status && status !== "all") {
      where.paymentStatus = status;
    }

    if (q) {
      where[Op.or] = [
        { transactionCode: { [Op.like]: `%${q}%` } },
        { description: { [Op.like]: `%${q}%` } },
      ];
    }

    const { rows, count } = await Transaction.findAndCountAll({
      where,
      include: [{ model: Gym, attributes: ["id", "name"] }],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    const parseMetadata = (meta) => {
      if (!meta) return {};
      if (typeof meta === "string") {
        try {
          return JSON.parse(meta);
        } catch (e) {
          return {};
        }
      }
      return meta;
    };

    const poIds = Array.from(
      new Set(
        rows
          .map((row) => Number(parseMetadata(row.metadata)?.purchaseOrderId))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    const purchaseOrders = poIds.length
      ? await PurchaseOrder.findAll({
          where: { id: { [Op.in]: poIds } },
          include: [
            { model: Supplier, as: "supplier", attributes: ["id", "name"] },
            { model: Gym, as: "gym", attributes: ["id", "name"] },
          ],
        })
      : [];

    const poById = new Map(purchaseOrders.map((po) => [po.id, po]));

    const data = rows.map((row) => {
      const json = row.toJSON();
      const metadata = parseMetadata(json.metadata);
      const poId = Number(metadata?.purchaseOrderId);
      return {
        ...json,
        metadata,
        paymentPhase: metadata?.paymentPhase || null,
        purchaseOrder: Number.isFinite(poId) ? poById.get(poId) || null : null,
      };
    });

    return {
      data,
      meta: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) },
    };
  },
};

export default ownerPurchaseService;
