import db from "../../models";
import { Op } from "sequelize";
import procurementStockHelper from "../procurementStockHelper";

const { buildStockContext, validateRequestReason } = procurementStockHelper;

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
  User,
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


const EPS = 0.01;

const normalizePaymentStatus = (value) => String(value || "").toLowerCase();

async function findEquipmentPurchaseTxsForPO(poId) {
  const poIdN = Number(poId);
  try {
    return await Transaction.findAll({
      where: {
        transactionType: "equipment_purchase",
        [Op.and]: [sequelize.where(sequelize.json("metadata.purchaseOrderId"), poIdN)],
      },
      include: [{ model: User, as: "processor", attributes: ["id", "username", "email"] }],
      order: [["transactionDate", "DESC"], ["createdAt", "DESC"]],
    });
  } catch (e) {
    return await Transaction.findAll({
      where: {
        transactionType: "equipment_purchase",
        metadata: { [Op.like]: `%\"purchaseOrderId\":${poIdN}%` },
      },
      include: [{ model: User, as: "processor", attributes: ["id", "username", "email"] }],
      order: [["transactionDate", "DESC"], ["createdAt", "DESC"]],
    });
  }
}

function buildPaymentSummary(totalAmount, txs) {
  const total = Number(totalAmount || 0);
  const completed = (txs || []).filter((x) => normalizePaymentStatus(x.paymentStatus) === "completed");
  const paidAmount = completed.reduce((s, x) => s + Number(x.amount || 0), 0);
  const depositPaidAmount = completed
    .filter((x) => String(x.metadata?.paymentPhase || "").toLowerCase() === "deposit")
    .reduce((s, x) => s + Number(x.amount || 0), 0);
  const depositRequired = Number((total * 0.3).toFixed(2));
  const remainingAmount = Math.max(0, Number((total - paidAmount).toFixed(2)));
  const finalRequired = Math.max(0, Number((total - depositRequired).toFixed(2)));

  let paymentStage = "not_started";
  if (paidAmount > EPS && paidAmount + EPS < total) paymentStage = "partially_paid";
  if (depositPaidAmount >= depositRequired - EPS) paymentStage = "deposit_completed";
  if (paidAmount >= total - EPS) paymentStage = "fully_paid";

  return {
    totalAmount: total,
    depositRequired,
    depositPaidAmount,
    finalRequired,
    paidAmount,
    remainingAmount,
    paymentStage,
    transactionCount: (txs || []).length,
    transactions: txs || [],
  };
}

const ownerPurchaseService = {
  // ===== SUPPLIERS =====
  async getSuppliers(ownerUserId, query) {
    const { page, limit, offset } = parsePaging(query);
    const { q, isActive, status } = query;

    const where = {};
    if (status && status !== "all") {
      where.status = String(status).toLowerCase();
    } else if (isActive !== undefined) {
      where.status = isActive === "true" || isActive === true ? "active" : "inactive";
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
      data: rows,
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
      data: rows,
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

    const enrichedRows = await Promise.all((rows || []).map(async (po) => {
      const txs = await findEquipmentPurchaseTxsForPO(po.id);
      const paymentSummary = buildPaymentSummary(po.totalAmount, txs);
      return {
        ...po.toJSON(),
        paymentSummary: { ...paymentSummary, transactions: undefined },
      };
    }));

    return {
      data: enrichedRows,
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
          attributes: ["id", "equipmentId", "quantity", "unitPrice", "receivedQuantity"],
          include: [{ model: Equipment, as: "equipment", attributes: ["id", "name", "code"] }],
        },
      ],
    });

    ensure(po, "Purchase order not found", 404);
    ensure(po.gym?.ownerId === ownerUserId, "Not authorized", 403);

    const txs = await findEquipmentPurchaseTxsForPO(po.id);
    const receipts = await Receipt.findAll({
      where: { purchaseOrderId: po.id },
      include: [
        { model: ReceiptItem, as: "items", attributes: ["id", "quantity", "unitPrice", "totalPrice"] },
      ],
      order: [["receiptDate", "DESC"], ["createdAt", "DESC"]],
    });

    const receiptSummary = {
      totalReceiptCount: receipts.length,
      completedReceiptCount: receipts.filter((r) => r.status === "completed").length,
      totalReceivedQuantity: (po.items || []).reduce((sum, item) => sum + Number(item.receivedQuantity || 0), 0),
      receipts: receipts.map((r) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        receiptDate: r.receiptDate,
        totalValue: r.totalValue,
        itemCount: (r.items || []).length,
      })),
    };

    return {
      ...po.toJSON(),
      paymentSummary: buildPaymentSummary(po.totalAmount, txs),
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
        { model: Supplier, as: "supplier", attributes: ["id", "name", "code"] },
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
        { model: Supplier, as: "supplier", attributes: ["id", "name", "code", "email", "phone"] },
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

  // ===== PROCUREMENT PAYMENTS =====
  async getProcurementPayments(ownerUserId, query) {
    const { page, limit, offset } = parsePaging(query);
    const { paymentStatus, paymentPhase, q, gymId } = query;

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

    if (gymId) where.gymId = Number(gymId);
    if (paymentStatus && paymentStatus !== "all") where.paymentStatus = paymentStatus;

    const { rows, count } = await Transaction.findAndCountAll({
      where,
      include: [
        { model: Gym, attributes: ["id", "name"], required: false },
        { model: User, as: "processor", attributes: ["id", "username", "email"], required: false },
      ],
      order: [["transactionDate", "DESC"], ["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    const poIds = Array.from(new Set((rows || []).map((tx) => Number(tx.metadata?.purchaseOrderId)).filter(Boolean)));
    const poRows = poIds.length
      ? await PurchaseOrder.findAll({
          where: { id: { [Op.in]: poIds } },
          include: [
            { model: Supplier, as: "supplier", attributes: ["id", "name", "code"] },
            { model: Gym, as: "gym", attributes: ["id", "name"] },
          ],
        })
      : [];
    const poMap = new Map(poRows.map((po) => [Number(po.id), po]));

    const filtered = (rows || []).filter((tx) => {
      const phase = String(tx.metadata?.paymentPhase || "").toLowerCase();
      if (paymentPhase && paymentPhase !== "all" && phase !== String(paymentPhase).toLowerCase()) return false;
      if (!q) return true;
      const keyword = String(q).toLowerCase();
      const po = poMap.get(Number(tx.metadata?.purchaseOrderId));
      return [
        tx.transactionCode,
        tx.description,
        tx.Gym?.name,
        po?.code,
        po?.supplier?.name,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(keyword));
    });

    const data = filtered.map((tx) => {
      const po = poMap.get(Number(tx.metadata?.purchaseOrderId));
      return {
        ...tx.toJSON(),
        paymentPhase: String(tx.metadata?.paymentPhase || "").toLowerCase() || null,
        purchaseOrder: po ? po.toJSON() : null,
      };
    });

    return {
      data,
      meta: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) },
    };
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
    return { data: ctx };
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

      const pr = await PurchaseRequest.create(
        {
          code,
          gymId: Number(gymId),
          equipmentId: Number(equipmentId),
          expectedSupplierId: expectedSupplierId ? Number(expectedSupplierId) : null,
          requestedBy: ownerUserId,
          quantity: qty,
          expectedUnitPrice: Number(expectedUnitPrice || 0),
          reason: String(reason || "").trim(),
          priority: String(priority || "normal").trim() || "normal",
          note: note ? String(note) : null,
          status: "submitted",
          stockSnapshot: ctx,
        },
        { transaction: t }
      );

      return pr;
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

    return pr;
  },
};

export default ownerPurchaseService;
