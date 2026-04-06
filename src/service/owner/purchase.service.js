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

    return {
      data: rows,
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

    return po;
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
