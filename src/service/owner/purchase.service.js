import db from "../../models";
import { Op, QueryTypes } from "sequelize";
import ExcelJS from "exceljs";
import procurementStockHelper from "../procurementStockHelper";
import { getAdminWarehouseGymIdSet } from "../adminWarehouseGymScope";
import realtimeService from "../realtime.service";
import payosService from "../payment/payos.service";
import equipmentUnitEventUtils from "../../utils/equipmentUnitEvent";
import comboPurchaseFlowService from "../comboPurchaseFlow.service";
import crypto from "crypto";

const { buildStockContext, computeFulfillmentPlan, validateRequestReason } = procurementStockHelper;
const { logEquipmentUnitEvents } = equipmentUnitEventUtils;

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
  EquipmentUnit,
  Inventory,
  sequelize,
} = db;

const parsePaging = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const parseMeta = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const ensure = (condition, message, statusCode = 400) => {
  if (!condition) throw { message, statusCode };
};

const pad6 = (n) => String(Math.max(0, Number(n) || 0)).padStart(6, "0");

const buildPublicQrUrl = (publicToken) => {
  const frontendOrigin = String(process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${frontendOrigin}/equipment/scan/${encodeURIComponent(String(publicToken || ""))}`;
};

const genUniquePublicToken = async ({ transaction } = {}) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(16).toString("hex");
    // eslint-disable-next-line no-await-in-loop
    const exists = await EquipmentUnit.findOne({
      where: { publicToken: token },
      attributes: ["id"],
      transaction,
      lock: transaction?.LOCK?.SHARE,
    });
    if (!exists) return token;
  }
  return crypto.randomBytes(24).toString("hex");
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

const statusLabelCombo = (status) =>
  ({
    submitted: "Chờ admin duyệt",
    approved_waiting_payment: "Chờ thanh toán",
    paid_waiting_admin_confirm: "Đã thanh toán, chờ admin bàn giao",
    shipping: "Đang giao combo",
    completed: "Hoàn tất",
    rejected: "Bị từ chối",
  }[String(status || "").toLowerCase()] || status || "-");

const formatDateTimeVN = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
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

let hasPreferredSupplierColumnCache = null;
const hasPreferredSupplierColumn = async () => {
  if (hasPreferredSupplierColumnCache !== null) return hasPreferredSupplierColumnCache;
  try {
    const rows = await sequelize.query(
      `
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'equipment'
        AND COLUMN_NAME = 'preferredSupplierId'
      LIMIT 1
      `,
      { type: QueryTypes.SELECT }
    );
    hasPreferredSupplierColumnCache = Array.isArray(rows) && rows.length > 0;
  } catch {
    hasPreferredSupplierColumnCache = false;
  }
  return hasPreferredSupplierColumnCache;
};
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

  // ===== EQUIPMENTS FOR PURCHASE (admin stock catalog) =====
  async getEquipmentsForPurchase(ownerUserId, query) {
    const { page, limit, offset } = parsePaging(query);
    const { q } = query;

    const where = { status: "active" };
    if (q) {
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { code: { [Op.like]: `%${q}%` } },
      ];
    }

    const includePreferredSupplier = await hasPreferredSupplierColumn();
    const { rows, count } = await Equipment.findAndCountAll({
      where,
      attributes: [
        "id",
        "name",
        "code",
        "description",
        "price",
        "categoryId",
        ...(includePreferredSupplier ? ["preferredSupplierId"] : []),
        "status",
      ],
      include: [
        { model: db.EquipmentCategory, as: "category", required: false, attributes: ["id", "name", "code"] },
        ...(includePreferredSupplier
          ? [{ model: Supplier, as: "preferredSupplier", required: false, attributes: ["id", "name", "code"] }]
          : []),
      ],
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
    if (payload?.comboId) {
      return comboPurchaseFlowService.createOwnerComboRequest(ownerUserId, payload);
    }

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

    const equipment = await Equipment.findByPk(Number(equipmentId), {
      attributes: ["id", "name", "status", "price"],
    });
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
      const unitPrice = Number(expectedUnitPrice || equipment.price || 0);
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
          expectedUnitPrice: unitPrice,
          availableQty,
          issueQty,
          purchaseQty,
          payableAmount,
          totalAmount: payableAmount,
          depositAmount,
          finalAmount: remainingAmount,
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
    if (!query?.legacy) {
      return comboPurchaseFlowService.ownerListRequests(ownerUserId, query);
    }

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

    const requestIds = rows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0);
    // Tránh OR theo từng id (rất nặng khi dữ liệu lớn): lấy tập giao dịch liên quan theo gym rồi map ngược.
    const txs = requestIds.length
      ? await Transaction.findAll({
          where: {
            transactionType: "equipment_purchase",
            gymId: { [Op.in]: gymIds },
            metadata: { [Op.like]: '%"purchaseRequestId":%' },
          },
          attributes: ["id", "metadata", "paymentStatus", "amount", "createdAt", "updatedAt"],
          order: [["id", "DESC"]],
          limit: Math.max(500, requestIds.length * 20),
        })
      : [];
    const requestIdSet = new Set(requestIds);
    const latestTxByRequestId = new Map();
    for (const tx of txs) {
      const meta = parseMeta(tx.metadata);
      const prId = Number(meta.purchaseRequestId || 0);
      if (prId && requestIdSet.has(prId) && !latestTxByRequestId.has(prId)) {
        latestTxByRequestId.set(prId, tx);
      }
    }
    const enriched = rows.map((r) => {
      const j = r.toJSON();
      const tx = latestTxByRequestId.get(j.id);
      return {
        ...j,
        paymentTransaction: tx ? tx.toJSON() : null,
      };
    });

    return {
      data: enriched,
      meta: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) },
    };
  },

  async getPurchaseRequestDetail(ownerUserId, requestId) {
    const request = await PurchaseRequest.findByPk(requestId);
    if (request?.comboId) {
      return comboPurchaseFlowService.ownerGetRequestDetail(ownerUserId, requestId);
    }

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

  async exportPurchaseRequestsExcel(ownerUserId, query = {}) {
    const list = await comboPurchaseFlowService.ownerListRequests(ownerUserId, {
      ...query,
      page: 1,
      limit: Math.min(5000, Math.max(1, Number(query.limit) || 2000)),
    });
    const rows = list?.data || [];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GFMS";
    workbook.created = new Date();
    const ws = workbook.addWorksheet("Lich su mua combo", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    ws.columns = [
      { header: "Mã yêu cầu", key: "code", width: 22 },
      { header: "Gym / Chi nhánh", key: "gym", width: 28 },
      { header: "Combo", key: "combo", width: 28 },
      { header: "Supplier", key: "supplier", width: 22 },
      { header: "Trạng thái", key: "status", width: 26 },
      { header: "Tổng tiền", key: "totalAmount", width: 14 },
      { header: "Thanh toán", key: "payment", width: 12 },
      { header: "Người liên hệ", key: "contactName", width: 18 },
      { header: "SĐT", key: "contactPhone", width: 14 },
      { header: "Email", key: "contactEmail", width: 22 },
      { header: "Ghi chú", key: "note", width: 30 },
      { header: "Ngày tạo", key: "createdAt", width: 18 },
      { header: "Cập nhật", key: "updatedAt", width: 18 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: "middle" };

    for (const r of rows) {
      const combo = r?.combo || r?.comboSnapshot || {};
      const supplierName =
        r?.expectedSupplier?.name ||
        combo?.supplier?.name ||
        r?.stockSnapshot?.supplier?.name ||
        "";

      ws.addRow({
        code: r?.code || `CBR-${r?.id || ""}`,
        gym: r?.gym?.name || "",
        combo: combo?.name || r?.stockSnapshot?.comboName || "",
        supplier: supplierName,
        status: statusLabelCombo(r?.status),
        totalAmount: Number(r?.totalAmount || r?.payableAmount || 0),
        payment: "100%",
        contactName: r?.contactName || "",
        contactPhone: r?.contactPhone || "",
        contactEmail: r?.contactEmail || "",
        note: r?.note || "",
        createdAt: formatDateTimeVN(r?.createdAt),
        updatedAt: formatDateTimeVN(r?.updatedAt),
      });
    }

    // Number formatting
    for (const key of ["totalAmount"]) {
      ws.getColumn(key).numFmt = "#,##0";
    }
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.alignment = { vertical: "top", wrapText: true };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `lich-su-mua-combo-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return { filename, buffer };
  },

  async createPurchaseRequestPayOSLink(ownerUserId, requestId, payload = {}) {
    const request = await PurchaseRequest.findByPk(requestId);
    if (request?.comboId) {
      const phase = String(payload?.phase || 'deposit').toLowerCase();
      return comboPurchaseFlowService.createPaymentLink(ownerUserId, requestId, phase);
    }

    const pr = await PurchaseRequest.findByPk(requestId, {
      include: [{ model: Gym, as: "gym", attributes: ["id", "ownerId"] }],
    });
    ensure(pr && pr.gym?.ownerId === ownerUserId, "Purchase request not found or not authorized", 404);
    ensure(String(pr.status) === "approved_waiting_payment", "Yêu cầu chưa ở trạng thái chờ thanh toán", 400);

    const requestIdNumber = Number(pr.id);
    let existing = null;
    try {
      existing = await Transaction.findOne({
        where: {
          transactionType: "equipment_purchase",
          paymentStatus: "pending",
          [Op.and]: [sequelize.where(sequelize.json("metadata.purchaseRequestId"), requestIdNumber)],
        },
        order: [["id", "DESC"]],
      });
    } catch {
      existing = await Transaction.findOne({
        where: {
          transactionType: "equipment_purchase",
          paymentStatus: "pending",
          metadata: { [Op.like]: `%\"purchaseRequestId\":${requestIdNumber}%` },
        },
        order: [["id", "DESC"]],
      });
    }
    const tx =
      existing ||
      (await Transaction.create({
        transactionCode: `PRPAY-${Date.now()}`,
        gymId: pr.gymId,
        amount: Math.round(Number(pr.quantity || 0) * Number(pr.expectedUnitPrice || 0)),
        transactionType: "equipment_purchase",
        paymentMethod: "payos",
        paymentStatus: "pending",
        description: `Thanh toán yêu cầu mua ${pr.code}`,
        transactionDate: new Date(),
        processedBy: ownerUserId,
        metadata: {
          purchaseRequestId: pr.id,
          purchaseRequestCode: pr.code,
          source: "direct_purchase_request",
        },
      }));

    const returnBase = process.env.FRONTEND_URL || "http://localhost:3000";
    const returnUrl = `${returnBase}/owner/purchase-requests/history?payos=success&orderCode=${encodeURIComponent(tx.id)}`;
    const cancelUrl = `${returnBase}/owner/purchase-requests/history?payos=cancel`;

    const { checkoutUrl, orderCode, paymentLinkId } = await payosService.createPackagePaymentLink({
      orderCode: tx.id,
      amount: Math.round(Number(tx.amount || 0)),
      description: `Thanh toan ${pr.code}`,
      returnUrl,
      cancelUrl,
    });

    await tx.update({
      metadata: {
        ...(tx.metadata || {}),
        payos: { orderCode, paymentLinkId, checkoutUrl },
      },
    });

    return { checkoutUrl, orderCode, paymentLinkId, transactionId: tx.id, amount: Number(tx.amount || 0) };
  },

  async confirmReceivePurchaseRequest(ownerUserId, requestId, req) {
    const request = await PurchaseRequest.findByPk(requestId);
    if (request?.comboId) {
      return comboPurchaseFlowService.confirmReceived(ownerUserId, requestId, req);
    }

    return sequelize.transaction(async (t) => {
      const pr = await PurchaseRequest.findByPk(requestId, {
        include: [{ model: Gym, as: "gym", attributes: ["id", "ownerId"] }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      ensure(pr && pr.gym?.ownerId === ownerUserId, "Purchase request not found or not authorized", 404);
      ensure(String(pr.status) === "shipping", "Yêu cầu chưa ở trạng thái đang giao", 400);

      const saleLogs = await Inventory.findAll({
        where: {
          transactionType: "sale",
          transactionId: pr.id,
          transactionCode: pr.code,
          equipmentId: pr.equipmentId,
        },
        transaction: t,
      });
      const alreadySoldQty = (saleLogs || []).reduce(
        (sum, row) => sum + Math.abs(Number(row.quantity || 0)),
        0
      );
      const requestedQty = Number(pr.quantity || 0);
      if (alreadySoldQty < requestedQty) {
        // Backfill thiếu hụt: nếu trước đó có log sale nhưng chưa đủ quantity,
        // vẫn phải tiếp tục trừ kho admin cho phần còn thiếu.
        let remaining = requestedQty - alreadySoldQty;
        const adminStocks = await EquipmentStock.findAll({
          where: { equipmentId: pr.equipmentId },
          include: [
            {
              model: Gym,
              as: "gym",
              attributes: ["id", "ownerId"],
              required: false,
            },
          ],
          order: [["availableQuantity", "DESC"], ["id", "ASC"]],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        const adminGymIdSet = await getAdminWarehouseGymIdSet({ transaction: t });
        const adminWarehouseStocks = adminStocks.filter((s) => adminGymIdSet.has(Number(s.gymId)));
        const nonOwnerStocks = adminStocks.filter((s) => Number(s.gymId) !== Number(pr.gymId));
        const sourceStocks = adminWarehouseStocks.length ? adminWarehouseStocks : nonOwnerStocks;
        if (!sourceStocks.length) {
          throw { message: "Không tìm thấy kho nguồn để trừ bù khi xác nhận nhận hàng.", statusCode: 400 };
        }

        const stockGymIds = Array.from(
          new Set(sourceStocks.map((s) => Number(s.gymId)).filter((id) => Number.isFinite(id) && id > 0))
        );
        const validGyms = stockGymIds.length
          ? await Gym.findAll({ where: { id: { [Op.in]: stockGymIds } }, attributes: ["id"], transaction: t, lock: t.LOCK.SHARE })
          : [];
        const validGymIdSet = new Set(validGyms.map((g) => Number(g.id)));
        const fallbackLogGymId = validGymIdSet.has(Number(pr.gymId)) ? Number(pr.gymId) : Number(validGyms[0]?.id || 0);
        for (const st of sourceStocks) {
          if (remaining <= 0) break;
          const avail = Number(st.availableQuantity || 0);
          if (avail <= 0) continue;
          const take = Math.min(avail, remaining);
          const before = Number(st.quantity || 0);
          st.quantity = Math.max(0, before - take);
          st.availableQuantity = Math.max(0, Number(st.availableQuantity || 0) - take);
          await st.save({ transaction: t });
          remaining -= take;
          const stockGymId = validGymIdSet.has(Number(st.gymId)) ? Number(st.gymId) : fallbackLogGymId;
          if (!stockGymId) continue;
          await Inventory.create(
            {
              gymId: stockGymId,
              equipmentId: pr.equipmentId,
              transactionType: "sale",
              transactionId: pr.id,
              transactionCode: pr.code,
              quantity: -take,
              unitPrice: pr.expectedUnitPrice || 0,
              totalValue: Number(pr.expectedUnitPrice || 0) * take,
              stockBefore: before,
              stockAfter: Number(st.quantity || 0),
              notes: `Xuất kho bán cho yêu cầu ${pr.code} (fallback khi owner xác nhận nhận)`,
              recordedBy: ownerUserId || null,
              recordedAt: new Date(),
            },
            { transaction: t }
          );
        }
        ensure(remaining <= 0, "Admin stock is not enough to complete this request", 400);
      }

      let ownerStock = await EquipmentStock.findOne({
        where: { gymId: pr.gymId, equipmentId: pr.equipmentId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!ownerStock) {
        ownerStock = await EquipmentStock.create(
          { gymId: pr.gymId, equipmentId: pr.equipmentId, quantity: 0, availableQuantity: 0 },
          { transaction: t }
        );
      }

      const addQty = Number(pr.quantity || 0);
      const before = Number(ownerStock.quantity || 0);
      ownerStock.quantity = before + addQty;
      ownerStock.availableQuantity = Number(ownerStock.availableQuantity || 0) + addQty;
      await ownerStock.save({ transaction: t });

      const existingUnitsForRequest = await EquipmentUnit.count({
        where: { purchaseRequestId: pr.id },
        transaction: t,
        lock: t.LOCK.SHARE,
      });

      let createdUnits = [];
      if (!existingUnitsForRequest && addQty > 0) {
        const tmpPrefix = `TMP-${pr.id}-${pr.equipmentId}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
        const units = [];
        for (let idx = 0; idx < addQty; idx += 1) {
          // eslint-disable-next-line no-await-in-loop
          const publicToken = await genUniquePublicToken({ transaction: t });
          units.push({
            equipmentId: pr.equipmentId,
            gymId: pr.gymId,
            assetCode: `${tmpPrefix}-${idx + 1}`,
            publicToken,
            qrUrl: buildPublicQrUrl(publicToken),
            status: "active",
            usageStatus: "in_stock",
            lifecycleStatus: "active",
            ownerId: ownerUserId || null,
            purchaseRequestId: pr.id,
            comboId: pr.comboId || null,
            deliveredAt: new Date(),
            notes: `Sinh ra từ yêu cầu mua thiết bị ${pr.code}`,
          });
        }

        createdUnits = await EquipmentUnit.bulkCreate(units, { transaction: t });
        for (const unit of createdUnits) {
          // eslint-disable-next-line no-await-in-loop
          await EquipmentUnit.update(
            { assetCode: `GFMS-EQ-${pad6(unit.id)}` },
            { where: { id: unit.id }, transaction: t }
          );
        }
      }

      if (createdUnits.length) {
        await logEquipmentUnitEvents(
          createdUnits.map((unit) => ({
            equipmentUnitId: unit.id,
            equipmentId: pr.equipmentId,
            gymId: pr.gymId,
            eventType: "created",
            referenceType: "purchase_request",
            referenceId: pr.id,
            performedBy: ownerUserId || null,
            notes: `Owner xác nhận nhận hàng qua yêu cầu ${pr.code}`,
            metadata: {
              purchaseRequestCode: pr.code,
              source: "owner_confirm_receive_purchase_request",
            },
            eventAt: new Date(),
          })),
          { transaction: t }
        );
      }

      await Inventory.create(
        {
          gymId: pr.gymId,
          equipmentId: pr.equipmentId,
          transactionType: "transfer_in",
          transactionId: pr.id,
          transactionCode: pr.code,
          quantity: addQty,
          unitPrice: pr.expectedUnitPrice || 0,
          totalValue: Number(pr.expectedUnitPrice || 0) * addQty,
          stockBefore: before,
          stockAfter: Number(ownerStock.quantity || 0),
          notes: `Owner xác nhận đã nhận thiết bị từ yêu cầu ${pr.code}`,
          recordedBy: ownerUserId,
          recordedAt: new Date(),
        },
        { transaction: t }
      );

      pr.status = "completed";
      await pr.save({ transaction: t });

      // Real-time: owner đã xác nhận nhận hàng -> báo ngay cho admin hệ thống.
      try {
        await realtimeService.notifyAdministrators({
          title: "Owner đã nhận thiết bị",
          message: `${pr.code} đã được owner xác nhận nhận hàng (${addQty} thiết bị).`,
          notificationType: "purchase_request",
          relatedType: "purchaserequest",
          relatedId: pr.id,
        });
      } catch (notifyErr) {
        // Không chặn nghiệp vụ chính nếu gửi thông báo lỗi.
        console.error("[owner/purchase] notify admin on confirm-receive failed:", notifyErr?.message || notifyErr);
      }
      return pr;
    });
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

    const normalizedRows = rows.map((row) => {
      const json = row.toJSON();
      const metadata = parseMetadata(json.metadata);
      const poId = Number(metadata?.purchaseOrderId);
      const prId = Number(metadata?.purchaseRequestId);
      return {
        ...json,
        metadata,
        paymentPhase: metadata?.paymentPhase || null,
        purchaseRequestId: Number.isFinite(prId) ? prId : null,
        purchaseOrder: Number.isFinite(poId) ? poById.get(poId) || null : null,
      };
    });

    // New procurement flow expects one logical payment record per purchase request.
    // If historical duplicates exist (pending + completed), keep the completed/latest row.
    const groupedByRequest = new Map();
    const passthroughRows = [];
    for (const row of normalizedRows) {
      if (!row.purchaseRequestId) {
        passthroughRows.push(row);
        continue;
      }
      const existing = groupedByRequest.get(row.purchaseRequestId);
      if (!existing) {
        groupedByRequest.set(row.purchaseRequestId, row);
        continue;
      }
      const existingCompleted = String(existing.paymentStatus || "").toLowerCase() === "completed";
      const rowCompleted = String(row.paymentStatus || "").toLowerCase() === "completed";
      if (rowCompleted && !existingCompleted) {
        groupedByRequest.set(row.purchaseRequestId, row);
        continue;
      }
      const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      const rowTime = new Date(row.updatedAt || row.createdAt || 0).getTime();
      if (rowTime > existingTime) groupedByRequest.set(row.purchaseRequestId, row);
    }

    const data = [...groupedByRequest.values(), ...passthroughRows].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    return {
      data,
      meta: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) },
    };
  },

  async getPayablePurchaseOrders(ownerUserId, query = {}) {
    const { page, limit, offset } = parsePaging(query);
    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => g.id);
    if (gymIds.length === 0) {
      return { data: [], meta: { page, limit, totalItems: 0, totalPages: 0 } };
    }

    const { rows, count } = await PurchaseOrder.findAndCountAll({
      where: {
        gymId: { [Op.in]: gymIds },
        status: { [Op.in]: ["deposit_pending", "received"] },
      },
      include: [
        { model: Supplier, as: "supplier", attributes: ["id", "name"] },
        { model: Gym, as: "gym", attributes: ["id", "name"] },
      ],
      order: [["updatedAt", "DESC"]],
      limit,
      offset,
    });

    const poIds = rows.map((r) => r.id);
    const txs = poIds.length
      ? await Transaction.findAll({
          where: {
            transactionType: "equipment_purchase",
            paymentStatus: "completed",
            [Op.or]: [
              ...poIds.map((id) => ({ metadata: { [Op.like]: `%\"purchaseOrderId\":${id}%` } })),
            ],
          },
        })
      : [];

    const paidByPo = new Map();
    const depositByPo = new Map();
    for (const tx of txs) {
      const meta = parseMeta(tx.metadata);
      const poId = Number(meta.purchaseOrderId || 0);
      if (!poId) continue;
      const amount = Number(tx.amount || 0);
      paidByPo.set(poId, Number(paidByPo.get(poId) || 0) + amount);
      if (String(meta.paymentPhase || "").toLowerCase() === "deposit") {
        depositByPo.set(poId, Number(depositByPo.get(poId) || 0) + amount);
      }
    }

    const data = rows.map((po) => {
      const total = Number(po.totalAmount || 0);
      const paid = Number(paidByPo.get(po.id) || 0);
      const remaining = Math.max(0, total - paid);
      const depositTarget = total * 0.3;
      const depositPaid = Number(depositByPo.get(po.id) || 0);
      const depositRemaining = Math.max(0, depositTarget - depositPaid);
      return {
        ...po.toJSON(),
        paymentSummary: {
          totalAmount: total,
          paidAmount: paid,
          remainingAmount: remaining,
          depositTarget,
          depositPaid,
          depositRemaining,
        },
      };
    });

    return {
      data,
      meta: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) },
    };
  },

  async createPurchaseOrderPayOSLink(ownerUserId, purchaseOrderId, payload = {}) {
    const po = await PurchaseOrder.findByPk(purchaseOrderId, {
      include: [{ model: Gym, as: "gym", attributes: ["id", "ownerId"] }],
    });
    ensure(po && po.gym?.ownerId === ownerUserId, "Purchase order not found or not authorized", 404);
    ensure(["deposit_pending", "received"].includes(String(po.status || "")), "PO chưa ở trạng thái có thể thanh toán", 400);

    const poId = Number(po.id);
    const txs = await Transaction.findAll({
      where: {
        transactionType: "equipment_purchase",
        paymentStatus: "completed",
        metadata: { [Op.like]: `%\"purchaseOrderId\":${poId}%` },
      },
    });
    const total = Number(po.totalAmount || 0);
    const paid = txs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const remaining = Math.max(0, total - paid);
    ensure(remaining > 0, "PO đã thanh toán đủ", 400);

    const phase = "full";
    const amount = Math.round(remaining);
    ensure(amount > 0, "Số tiền thanh toán không hợp lệ", 400);

    const tx = await Transaction.create({
      transactionCode: `POPAY-${Date.now()}`,
      gymId: po.gymId,
      amount: Math.round(amount),
      transactionType: "equipment_purchase",
      paymentMethod: "payos",
      paymentStatus: "pending",
      description: `Thanh toán toàn bộ PO ${po.code}`,
      transactionDate: new Date(),
      processedBy: ownerUserId,
      metadata: {
        purchaseOrderId: po.id,
        purchaseOrderCode: po.code,
        paymentPhase: phase,
        paymentChannel: "payos",
      },
    });

    const returnBase = process.env.FRONTEND_URL || "http://localhost:3000";
    const returnUrl = `${returnBase}/owner/procurement-payments?payos=success&orderCode=${encodeURIComponent(tx.id)}`;
    const cancelUrl = `${returnBase}/owner/procurement-payments?payos=cancel`;

    const { checkoutUrl, orderCode, paymentLinkId } = await payosService.createPackagePaymentLink({
      orderCode: tx.id,
      amount: Math.round(amount),
      description: `Thanh toan ${po.code}`,
      returnUrl,
      cancelUrl,
    });

    await tx.update({
      metadata: {
        ...(tx.metadata || {}),
        payos: {
          orderCode,
          paymentLinkId,
          checkoutUrl,
        },
      },
    });

    return {
      checkoutUrl,
      transactionId: tx.id,
      orderCode,
      paymentLinkId,
      amount: Math.round(amount),
      paymentPhase: phase,
      purchaseOrderId: po.id,
      purchaseOrderCode: po.code,
    };
  },

  async getActiveCombos(query) {
    return comboPurchaseFlowService.listCombos({ activeOnly: true, query });
  },

  async getComboDetail(comboId) {
    return comboPurchaseFlowService.getComboDetail(comboId);
  },
};

export default ownerPurchaseService;
