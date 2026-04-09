const { QueryTypes } = require("sequelize");
const dbImport = require("../models");
const db = dbImport?.default || dbImport;
const fs = require("fs");
const equipmentUnitEventUtils = require("../utils/equipmentUnitEvent");
const { logEquipmentUnitEvents } = equipmentUnitEventUtils;

// ✅ Cloudinary storage (enterprise)
const cloudinaryService = require("./cloudinaryService");


// ================= helpers =================
const pickPage = (query = {}) => {
  const page = Math.max(1, parseInt(query.page || "1", 10));
  const limit = Math.max(1, Math.min(200, parseInt(query.limit || "10", 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const tbl = (model, fallback) => {
  const t = model?.getTableName?.();
  const name = typeof t === "string" ? t : t?.tableName;
  if (name) return String(name);

  // ✅ fallback về lowercase vì bảng migration của bạn là lowercase
  return String(fallback || "").toLowerCase();
};



const qLike = (s) => `%${String(s || "").trim()}%`;

const normalizeList = (rows, totalItems, page, limit) => {
  const totalPages = Math.max(1, Math.ceil(Number(totalItems || 0) / limit));
  return { data: rows, meta: { page, limit, totalItems: Number(totalItems || 0), totalPages } };
};

const normalizeUploadBuffer = (file) => {
  if (file?.buffer) return file.buffer;
  if (file?.path && fs.existsSync(file.path)) return fs.readFileSync(file.path);
  return null;
};

const pad2 = (n) => String(n).padStart(2, "0");

// ===== timezone helpers (VN) =====
const VN_TZ_OFFSET_MIN = 420;

// getTimezoneOffset(): UTC - Local (phút). VN (UTC+7) => -420
const shiftToTz = (dt, targetOffsetMin = VN_TZ_OFFSET_MIN) => {
  const d = dt instanceof Date ? dt : new Date(dt);
  const curOffset = d.getTimezoneOffset();
  const diffMin = targetOffsetMin - curOffset;
  return new Date(d.getTime() + diffMin * 60 * 1000);
};

const toMySqlDateTimeVN = (val) => {
  const dt = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(dt.getTime())) return toMySqlDateTimeVN(new Date());

  const vn = shiftToTz(dt, VN_TZ_OFFSET_MIN);
  return `${vn.getUTCFullYear()}-${pad2(vn.getUTCMonth() + 1)}-${pad2(vn.getUTCDate())} ${pad2(
    vn.getUTCHours()
  )}:${pad2(vn.getUTCMinutes())}:${pad2(vn.getUTCSeconds())}`;
};

// nhận: "YYYY-MM-DD" hoặc "DD/MM/YYYY" hoặc ISO có time
const parseReceiptDateLocal = (val) => {
  if (!val) return new Date();

  if (typeof val === "string") {
    const s = val.trim();

    const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m1) {
      const y = Number(m1[1]);
      const mo = Number(m1[2]);
      const d = Number(m1[3]);

      const nowVN = shiftToTz(new Date(), VN_TZ_OFFSET_MIN);
      const hh = nowVN.getUTCHours();
      const mm = nowVN.getUTCMinutes();
      const ss = nowVN.getUTCSeconds();

      return new Date(Date.UTC(y, mo - 1, d, hh, mm, ss));
    }

    const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m2) {
      const d = Number(m2[1]);
      const mo = Number(m2[2]);
      const y = Number(m2[3]);

      const nowVN = shiftToTz(new Date(), VN_TZ_OFFSET_MIN);
      const hh = nowVN.getUTCHours();
      const mm = nowVN.getUTCMinutes();
      const ss = nowVN.getUTCSeconds();

      return new Date(Date.UTC(y, mo - 1, d, hh, mm, ss));
    }
  }

  const dt = new Date(val);
  return Number.isNaN(dt.getTime()) ? new Date() : dt;
};

// ===== whitelist payload để không dính cột rác =====
const pickEquipmentPayload = (payload = {}) => {
  const allowed = [
    "name",
    "code",
    "description",
    "categoryId",
    "preferredSupplierId",
    "brand",
    "model",
    "specifications",
    "unit",
    "price",
    "minStockLevel",
    "maxStockLevel",
    "status",
  ];
  const out = {};
  for (const k of allowed) {
    if (payload[k] !== undefined) out[k] = payload[k];
  }
  delete out.gymId;
  delete out.supplierId;
  return out;
};

const validateEquipmentPayload = (payload = {}, { isCreate = false } = {}) => {
  const errors = [];
  const name = String(payload.name || "").trim();
  const code = String(payload.code || "").trim();
  const price = payload.price;
  const quantity = payload.quantity;

  if (isCreate && !name) errors.push("Tên thiết bị là bắt buộc.");
  if (payload.name !== undefined && !name) errors.push("Tên thiết bị không được để trống.");

  if (code && !/^[A-Za-z0-9._-]+$/.test(code)) {
    errors.push("Mã thiết bị chỉ được chứa chữ, số và các ký tự . _ -");
  }

  if (price !== undefined && price !== null && Number(price) < 0) {
    errors.push("Giá bán không được âm.");
  }

  if (quantity !== undefined && quantity !== null && Number(quantity) < 0) {
    errors.push("Số lượng không được âm.");
  }

  return errors;
};

const pickSupplierPayload = (payload = {}) => {
  const out = {
    name: payload.name,
    code: payload.code,
    contactPerson: payload.contactPerson ?? null,
    phone: payload.phone ?? payload.contactPhone ?? null,
    email: payload.email ?? payload.contactEmail ?? null,
    address: payload.address ?? null,
    taxCode: payload.taxCode ?? null,
    notes: payload.notes ?? null,
  };

  if (payload.status === "active" || payload.status === "inactive") {
    out.status = payload.status;
  } else if (payload.isActive !== undefined) {
    out.status = payload.isActive ? "active" : "inactive";
  }

  delete out.contactPhone;
  delete out.contactEmail;
  return out;
};

const buildUpdateSQL = (table, id, data) => {
  const keys = Object.keys(data || {}).filter((k) => data[k] !== undefined);
  if (!keys.length) return null;

  const sets = keys.map((k) => `\`${k}\` = :${k}`).join(", ");
  return {
    sql: `UPDATE \`${table}\` SET ${sets}, \`updatedAt\` = NOW() WHERE id = :id`,
    replacements: { ...data, id: Number(id) },
  };
};

const selectById = async (table, id, transaction) => {
  const rows = await db.sequelize.query(`SELECT * FROM \`${table}\` WHERE id = :id LIMIT 1`, {
    type: QueryTypes.SELECT,
    replacements: { id: Number(id) },
    transaction,
  });
  return rows?.[0] || null;
};

// ================= STOCK RAW =================
const getOrCreateStockRaw = async ({ gymId, equipmentId }, t) => {
  const stTable = tbl(db.EquipmentStock, "equipmentstock");

  const found = await db.sequelize.query(
    `SELECT * FROM \`${stTable}\`
     WHERE gymId = :gymId AND equipmentId = :equipmentId
     LIMIT 1 FOR UPDATE`,
    {
      type: QueryTypes.SELECT,
      replacements: { gymId: Number(gymId), equipmentId: Number(equipmentId) },
      transaction: t,
    }
  );

  if (found?.[0]) return found[0];

  await db.sequelize.query(
    `INSERT INTO \`${stTable}\`
      (equipmentId, gymId, quantity, reservedQuantity, availableQuantity, location, reorderPoint, lastRestocked, createdAt, updatedAt)
     VALUES
      (:equipmentId, :gymId, 0, 0, 0, NULL, NULL, NULL, NOW(), NOW())`,
    {
      type: QueryTypes.INSERT,
      replacements: { gymId: Number(gymId), equipmentId: Number(equipmentId) },
      transaction: t,
    }
  );

  const again = await db.sequelize.query(
    `SELECT * FROM \`${stTable}\`
     WHERE gymId = :gymId AND equipmentId = :equipmentId
     LIMIT 1 FOR UPDATE`,
    {
      type: QueryTypes.SELECT,
      replacements: { gymId: Number(gymId), equipmentId: Number(equipmentId) },
      transaction: t,
    }
  );

  return again?.[0] || null;
};

const createEquipmentUnitsRaw = async ({ gymId, equipmentId, quantity, notes }, transaction) => {
  const qty = Math.max(0, Number(quantity || 0));
  if (!qty) return [];

  const now = Date.now();
  return db.EquipmentUnit.bulkCreate(
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
};

// ================= service =================
const adminInventoryService = {
  // ✅ GYMS (dropdown)
  async getGyms() {
    const gymTable = tbl(db.Gym, "Gym");
    const rows = await db.sequelize.query(
      `SELECT id, name, address, status FROM \`${gymTable}\` ORDER BY name ASC`,
      { type: QueryTypes.SELECT }
    );
    return { data: rows };
  },

  // ================== CATEGORIES ==================
  async getEquipmentCategories() {
    const table = tbl(db.EquipmentCategory, "EquipmentCategory");
    const rows = await db.sequelize.query(`SELECT * FROM \`${table}\` ORDER BY name ASC`, {
      type: QueryTypes.SELECT,
    });
    return { data: rows };
  },

   // ================== EQUIPMENTS ==================
async getEquipments(query = {}) {
  const { page, limit, offset } = pickPage(query);
  const q = String(query.q || "").trim();
  const status = query.status && query.status !== "all" ? String(query.status) : null;
  const categoryId = query.categoryId ? Number(query.categoryId) : null;

  // ✅ dùng đúng tên bảng theo migration (lowercase)
  const eqTable = "equipment";
  const catTable = "equipmentcategory";
  const imgTable = "equipmentimage";
  const supTable = "supplier";

  const where = [];
  const params = {};

  if (q) {
    where.push(`(e.name LIKE :q OR e.code LIKE :q OR e.brand LIKE :q OR e.model LIKE :q)`);
    params.q = qLike(q);
  }
  if (status) {
    where.push(`e.status = :status`);
    params.status = status;
  }
  if (categoryId) {
    where.push(`e.categoryId = :categoryId`);
    params.categoryId = categoryId;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const joinCatSql = `LEFT JOIN \`${catTable}\` c ON c.id = e.categoryId`;
  const joinSupSql = `LEFT JOIN \`${supTable}\` s ON s.id = e.preferredSupplierId`;

  // ✅ lấy ảnh đại diện: ưu tiên isPrimary=1, nếu không có thì lấy ảnh đầu tiên theo sortOrder/id
  // -> tuyệt đối KHÔNG dính gymId
  const primaryImageSubQuery = `
    (
      SELECT i.url
      FROM \`${imgTable}\` i
      WHERE i.equipmentId = e.id
      ORDER BY i.isPrimary DESC, i.sortOrder ASC, i.id ASC
      LIMIT 1
    )
  `;

  const selectSql = `
    SELECT
      e.id,
      e.name,
      e.code,
      e.description,
      e.categoryId,
      e.preferredSupplierId,
      e.brand,
      e.model,
      e.specifications,
      e.unit,
      e.price,
      e.minStockLevel,
      e.maxStockLevel,
      e.status,
      e.createdAt,
      e.updatedAt,
      c.name AS categoryName,
      s.name AS preferredSupplierName,
      ${primaryImageSubQuery} AS primaryImageUrl
    FROM \`${eqTable}\` e
    ${joinCatSql}
    ${joinSupSql}
    ${whereSql}
    ORDER BY e.id DESC
    LIMIT :limit OFFSET :offset
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM \`${eqTable}\` e
    ${whereSql}
  `;

  const [rows, countRows] = await Promise.all([
    db.sequelize.query(selectSql, {
      type: QueryTypes.SELECT,
      replacements: { ...params, limit, offset },
    }),
    db.sequelize.query(countSql, {
      type: QueryTypes.SELECT,
      replacements: params,
    }),
  ]);

  const totalItems = Number(countRows?.[0]?.total || 0);
  return normalizeList(rows, totalItems, page, limit);
},



  // ================== SUPPLIERS ==================
  async getSuppliers(query = {}) {
    const { page, limit, offset } = pickPage(query);
    const q = String(query.q || "").trim();
    const table = tbl(db.Supplier, "Supplier");

    const where = [];
    const params = {};

    if (q) {
      where.push(`(name LIKE :q OR code LIKE :q OR phone LIKE :q OR email LIKE :q)`);
      params.q = qLike(q);
    }

    let status = null;
    if (query.status !== undefined && query.status !== "" && query.status !== "all") {
      status = String(query.status);
    } else if (query.isActive !== undefined && query.isActive !== "" && query.isActive !== "all") {
      const isActive = query.isActive === true || query.isActive === "true";
      status = isActive ? "active" : "inactive";
    }

    if (status === "active" || status === "inactive") {
      where.push(`status = :status`);
      params.status = status;
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows, countRows] = await Promise.all([
      db.sequelize.query(
        `
        SELECT
          s.*,
          CASE WHEN s.status = 'active' THEN 1 ELSE 0 END AS isActive
        FROM \`${table}\` s
        ${whereSql}
        ORDER BY s.id DESC
        LIMIT :limit OFFSET :offset
        `,
        { type: QueryTypes.SELECT, replacements: { ...params, limit, offset } }
      ),
      db.sequelize.query(`SELECT COUNT(*) AS total FROM \`${table}\` ${whereSql}`, {
        type: QueryTypes.SELECT,
        replacements: params,
      }),
    ]);

    const totalItems = Number(countRows?.[0]?.total || 0);
    return normalizeList(rows, totalItems, page, limit);
  },

  // ================== STOCKS ==================
  async getStocks(query = {}) {
    const { page, limit, offset } = pickPage(query);
    const q = String(query.q || "").trim();
    const gymId = query.gymId ? Number(query.gymId) : null;

    const stTable = tbl(db.EquipmentStock, "EquipmentStock");
    const eqTable = db.Equipment ? tbl(db.Equipment, "Equipment") : null;
    const gymTable = db.Gym ? tbl(db.Gym, "Gym") : null;
    const catTable = db.EquipmentCategory ? tbl(db.EquipmentCategory, "EquipmentCategory") : null;

    const where = [];
    const params = {};
    const includeOwnerGyms = query.includeOwnerGyms === true || String(query.includeOwnerGyms || "") === "true";
    let centralOnly = false;
    if (!includeOwnerGyms && gymTable) {
      // Only apply central-gym filter when central gyms exist.
      const centralCountRows = await db.sequelize.query(
        `SELECT COUNT(*) AS total FROM \`${gymTable}\` WHERE ownerId IS NULL`,
        { type: QueryTypes.SELECT }
      );
      const centralCount = Number(centralCountRows?.[0]?.total || 0);
      centralOnly = centralCount > 0;
    }

    if (gymId) {
      where.push(`s.gymId = :gymId`);
      params.gymId = gymId;
    }

    if (q && eqTable) {
      where.push(`(e.name LIKE :q OR e.code LIKE :q OR g.name LIKE :q)`);
      params.q = qLike(q);
    }

    // Use equipment table as the base, so new equipment still appears
    // in inventory even when it has no stock row yet (quantity = 0).
    const stockScopeConds = [];
    if (centralOnly) stockScopeConds.push(`g.ownerId IS NULL`);
    if (gymId) stockScopeConds.push(`s.gymId = :gymId`);
    const stockScope = stockScopeConds.length ? stockScopeConds.join(" AND ") : "1=1";

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const joins = `
      LEFT JOIN \`${stTable}\` s ON s.equipmentId = e.id
      ${gymTable ? `LEFT JOIN \`${gymTable}\` g ON g.id = s.gymId` : ""}
      ${catTable ? `LEFT JOIN \`${catTable}\` c ON c.id = e.categoryId` : ""}
    `;

    const baseFromSql = `FROM \`${eqTable}\` e ${joins} ${whereSql}`;

    const [rows, countRows] = await Promise.all([
      db.sequelize.query(
        `
        SELECT 
          e.id AS equipmentId,
          e.name AS equipmentName,
          e.code AS equipmentCode,
          ${catTable ? "c.name AS categoryName," : "NULL AS categoryName,"}
          e.minStockLevel AS equipmentMinStockLevel,
          COALESCE(SUM(CASE WHEN ${stockScope} THEN s.quantity ELSE 0 END), 0) AS quantity,
          COALESCE(SUM(CASE WHEN ${stockScope} THEN s.availableQuantity ELSE 0 END), 0) AS availableQuantity,
          COALESCE(SUM(CASE WHEN ${stockScope} THEN s.reservedQuantity ELSE 0 END), 0) AS reservedQuantity,
          COALESCE(SUM(CASE WHEN ${stockScope} THEN s.damagedQuantity ELSE 0 END), 0) AS damagedQuantity,
          COALESCE(SUM(CASE WHEN ${stockScope} THEN s.maintenanceQuantity ELSE 0 END), 0) AS maintenanceQuantity,
          NULL AS reorderPoint,
          NULL AS gymName
        ${baseFromSql}
        GROUP BY e.id, e.name, e.code, e.minStockLevel ${catTable ? ", c.name" : ""}
        ORDER BY e.name ASC, e.id DESC
        LIMIT :limit OFFSET :offset
        `,
        { type: QueryTypes.SELECT, replacements: { ...params, limit, offset } }
      ),
      db.sequelize.query(
        `
        SELECT COUNT(*) AS total
        FROM (
          SELECT e.id
          ${baseFromSql}
          GROUP BY e.id
        ) x
        `,
        { type: QueryTypes.SELECT, replacements: params }
      ),
    ]);

    const normalizedRows = (rows || []).map((row) => {
      const currentQuantity = Number(row.availableQuantity ?? row.quantity ?? 0);
      const minStockLevel = Number(row.equipmentMinStockLevel ?? row.minStockLevel ?? row.reorderPoint ?? 0);
      const shortageQuantity = Math.max(minStockLevel - currentQuantity, 0);
      const stockStatus = currentQuantity <= 0 ? "Hết hàng" : currentQuantity <= minStockLevel ? "Sắp thiếu" : "Đủ hàng";
      return {
        ...row,
        currentQuantity,
        minStockLevel,
        shortageQuantity,
        stockStatus,
      };
    });

    const totalItems = Number(countRows?.[0]?.total || 0);
    return normalizeList(normalizedRows, totalItems, page, limit);
  },

  // ================== EQUIPMENT (C/R/D) ==================
  async createEquipment(payload) {
    const validationErrors = validateEquipmentPayload(payload, { isCreate: true });
    if (validationErrors.length) {
      throw new Error(validationErrors.join(" "));
    }

    const clean = pickEquipmentPayload(payload);
    if (!String(clean.name || "").trim()) throw new Error("name is required");
    const created = await db.Equipment.create(clean, { fields: Object.keys(clean) });

    const initialQty = Math.max(0, Number(payload?.quantity || 0));
    if (initialQty > 0) {
      const defaultGym = await db.Gym.findOne({
        attributes: ["id"],
        order: [["id", "ASC"]],
      });

      if (defaultGym?.id) {
        await db.EquipmentStock.create({
          equipmentId: created.id,
          gymId: Number(defaultGym.id),
          quantity: initialQty,
          reservedQuantity: 0,
          availableQuantity: initialQty,
          location: null,
          reorderPoint: null,
          lastRestocked: new Date(),
        });
      }
    }

    return created;
  },

  async updateEquipment(id, payload) {
    const table = tbl(db.Equipment, "Equipment");
    const validationErrors = validateEquipmentPayload(payload, { isCreate: false });
    if (validationErrors.length) {
      throw new Error(validationErrors.join(" "));
    }

    const clean = pickEquipmentPayload(payload);

    if (clean.name !== undefined && !String(clean.name || "").trim()) {
      throw new Error("name is required");
    }

    const built = buildUpdateSQL(table, id, clean);
    if (built) {
      await db.sequelize.query(built.sql, {
        type: QueryTypes.UPDATE,
        replacements: built.replacements,
      });
    }

    const after = await selectById(table, id);
    return after;
  },

  async discontinueEquipment(id) {
    const table = tbl(db.Equipment, "Equipment");
    await db.sequelize.query(
      `UPDATE \`${table}\` SET status = 'discontinued', updatedAt = NOW() WHERE id = :id`,
      { type: QueryTypes.UPDATE, replacements: { id: Number(id) } }
    );
    const after = await selectById(table, id);
    return after;
  },

  async deleteEquipment(id) {
    const eqId = Number(id);
    if (!eqId) throw new Error("Invalid equipment id");

    const equipment = await db.Equipment.findByPk(eqId, { attributes: ["id", "name"] });
    if (!equipment) throw new Error("Thiết bị không tồn tại");

    const [stockCount, inventoryCount, unitCount, quotationItemCount, poItemCount, receiptItemCount, requestCount] =
      await Promise.all([
        db.EquipmentStock.count({ where: { equipmentId: eqId } }),
        db.Inventory.count({ where: { equipmentId: eqId } }),
        db.EquipmentUnit ? db.EquipmentUnit.count({ where: { equipmentId: eqId } }) : 0,
        db.QuotationItem ? db.QuotationItem.count({ where: { equipmentId: eqId } }) : 0,
        db.PurchaseOrderItem ? db.PurchaseOrderItem.count({ where: { equipmentId: eqId } }) : 0,
        db.ReceiptItem ? db.ReceiptItem.count({ where: { equipmentId: eqId } }) : 0,
        db.PurchaseRequest ? db.PurchaseRequest.count({ where: { equipmentId: eqId } }) : 0,
      ]);

    if (stockCount > 0 || inventoryCount > 0 || unitCount > 0 || quotationItemCount > 0 || poItemCount > 0 || receiptItemCount > 0 || requestCount > 0) {
      throw new Error(
        "Không thể xóa thiết bị vì đã phát sinh dữ liệu kho/chứng từ. Hãy dùng 'Ẩn thiết bị' thay vì xóa cứng."
      );
    }

    const images = db.EquipmentImage
      ? await db.EquipmentImage.findAll({ where: { equipmentId: eqId } })
      : [];

    await db.sequelize.transaction(async (t) => {
      if (db.EquipmentImage) {
        await db.EquipmentImage.destroy({ where: { equipmentId: eqId }, transaction: t });
      }
      await db.Equipment.destroy({ where: { id: eqId }, transaction: t });
    });

    for (const img of images) {
      try {
        if (img.publicId) await cloudinaryService.destroy(img.publicId, "image");
      } catch (_) {}
    }

    return { message: `Đã xóa thiết bị "${equipment.name}"` };
  },

  // ================== SUPPLIER (C/R/U) ==================
  async createSupplier(payload) {
    const clean = pickSupplierPayload(payload);
    if (!String(clean.name || "").trim()) throw new Error("name is required");
    const created = await db.Supplier.create(clean, { fields: Object.keys(clean) });
    return created;
  },

  async updateSupplier(id, payload) {
    const table = tbl(db.Supplier, "Supplier");
    const clean = pickSupplierPayload(payload);

    if (clean.name !== undefined && !String(clean.name || "").trim()) {
      throw new Error("name is required");
    }

    const built = buildUpdateSQL(table, id, clean);
    if (built) {
      await db.sequelize.query(built.sql, { type: QueryTypes.UPDATE, replacements: built.replacements });
    }

    const after = await selectById(table, id);
    return after;
  },

  // ✅ status active/inactive (nhận boolean)
  async setSupplierActive(id, isActive) {
    const table = tbl(db.Supplier, "Supplier");
    if (isActive === undefined) throw new Error("isActive is required");

    const next = isActive ? "active" : "inactive";
    await db.sequelize.query(
      `UPDATE \`${table}\` SET status = :status, updatedAt = NOW() WHERE id = :id`,
      { type: QueryTypes.UPDATE, replacements: { id: Number(id), status: next } }
    );

    const after = await selectById(table, id);
    if (after) after.isActive = after.status === "active";
    return after;
  },

  // =====================================================================
  // ✅ NHẬP KHO (Receipt + ReceiptItem + update Stock + Inventory log)
  // =====================================================================
  async createReceipt(payload = {}, auditMeta = {}) {
    const receiptTable = tbl(db.Receipt, "Receipt");
    const receiptItemTable = tbl(db.ReceiptItem, "ReceiptItem");
    const invTable = tbl(db.Inventory, "Inventory");

    const gymId = payload.gymId ? Number(payload.gymId) : null;
    if (!gymId) throw new Error("gymId is required");

    // ✅ supplierId chuẩn nghiệp vụ (cần migration add cột vào Receipt)
    const supplierId = payload.supplierId ? Number(payload.supplierId) : null;

    let purchaseOrderId = payload.purchaseOrderId ? Number(payload.purchaseOrderId) : null;

    const receiptDateObj = parseReceiptDateLocal(payload.receiptDate);
    const receiptDate = toMySqlDateTimeVN(receiptDateObj);

    const processedBy = auditMeta.actorUserId
      ? Number(auditMeta.actorUserId)
      : payload.processedBy
      ? Number(payload.processedBy)
      : null;

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) throw new Error("items is required");

    const code = String(payload.code || "").trim() || `REC-${Date.now()}`;

    return db.sequelize.transaction(async (t) => {
      let totalValue = 0;

      if (purchaseOrderId) {
        const poTable = tbl(db.PurchaseOrder, "PurchaseOrder");
        const exists = await db.sequelize.query(
          `SELECT id FROM \`${poTable}\` WHERE id = :id LIMIT 1`,
          { type: QueryTypes.SELECT, transaction: t, replacements: { id: purchaseOrderId } }
        );
        if (!exists?.length) purchaseOrderId = null;
      }

      // ✅ insert Receipt (có supplierId nếu DB đã có cột)
      // Nếu DB chưa migrate supplierId, bạn chạy migration ở phần dưới.
      await db.sequelize.query(
        `INSERT INTO \`${receiptTable}\`
          (code, purchaseOrderId, type, gymId, processedBy, receiptDate, status, totalValue, notes, supplierId, createdAt, updatedAt)
         VALUES
          (:code, :purchaseOrderId, 'inbound', :gymId, :processedBy, :receiptDate, 'completed', 0, :notes, :supplierId, NOW(), NOW())`,
        {
          type: QueryTypes.INSERT,
          transaction: t,
          replacements: {
            code,
            purchaseOrderId,
            gymId,
            processedBy,
            receiptDate,
            notes: payload.notes || null,
            supplierId,
          },
        }
      );

      const createdReceipt = await db.sequelize.query(
        `SELECT * FROM \`${receiptTable}\` WHERE code = :code ORDER BY id DESC LIMIT 1`,
        { type: QueryTypes.SELECT, transaction: t, replacements: { code } }
      );
      const receipt = createdReceipt?.[0];
      if (!receipt?.id) throw new Error("Cannot create receipt");

      for (const it of items) {
        const equipmentId = Number(it.equipmentId);
        const quantity = Number(it.quantity ?? it.receivedQuantity ?? it.qty ?? 0);
        if (!equipmentId || quantity <= 0) throw new Error("Invalid receipt item");

        const unitPrice =
          it.unitPrice === null || it.unitPrice === undefined || it.unitPrice === ""
            ? null
            : Number(it.unitPrice);

        const totalPrice = unitPrice === null ? null : unitPrice * quantity;
        if (typeof totalPrice === "number" && !Number.isNaN(totalPrice)) totalValue += totalPrice;

        await db.sequelize.query(
          `INSERT INTO \`${receiptItemTable}\`
            (receiptId, equipmentId, quantity, unitPrice, totalPrice, batchNumber, expiryDate, notes, createdAt, updatedAt)
           VALUES
            (:receiptId, :equipmentId, :quantity, :unitPrice, :totalPrice, :batchNumber, :expiryDate, :notes, NOW(), NOW())`,
          {
            type: QueryTypes.INSERT,
            transaction: t,
            replacements: {
              receiptId: Number(receipt.id),
              equipmentId,
              quantity,
              unitPrice,
              totalPrice,
              batchNumber: it.batchNumber ?? null,
              expiryDate: it.expiryDate ? toMySqlDateTimeVN(parseReceiptDateLocal(it.expiryDate)) : null,
              notes: it.notes ?? null,
            },
          }
        );

        const stock = await getOrCreateStockRaw({ gymId, equipmentId }, t);
        const beforeAvail = Number(stock.availableQuantity || 0);
        const beforeQty = Number(stock.quantity || 0);

        const afterAvail = beforeAvail + quantity;
        const afterQty = beforeQty + quantity;

        const stTable = tbl(db.EquipmentStock, "EquipmentStock");
        await db.sequelize.query(
          `UPDATE \`${stTable}\`
           SET availableQuantity = :afterAvail,
               quantity = :afterQty,
               lastRestocked = :lastRestocked,
               updatedAt = NOW()
           WHERE id = :id`,
          {
            type: QueryTypes.UPDATE,
            transaction: t,
            replacements: {
              id: Number(stock.id),
              afterAvail,
              afterQty,
              lastRestocked: toMySqlDateTimeVN(new Date()),
            },
          }
        );

        await db.sequelize.query(
          `INSERT INTO \`${invTable}\`
            (equipmentId, gymId, transactionType, transactionId, transactionCode,
             quantity, unitPrice, totalValue, stockBefore, stockAfter, notes,
             recordedBy, recordedAt, createdAt, updatedAt)
           VALUES
            (:equipmentId, :gymId, 'purchase', :transactionId, :transactionCode,
             :qty, :unitPrice, :totalValue, :stockBefore, :stockAfter, :notes,
             :recordedBy, :recordedAt, NOW(), NOW())`,
          {
            type: QueryTypes.INSERT,
            transaction: t,
            replacements: {
              equipmentId,
              gymId,
              transactionId: Number(receipt.id),
              transactionCode: String(code),
              qty: Number(quantity),
              unitPrice,
              totalValue: totalPrice,
              stockBefore: beforeAvail,
              stockAfter: afterAvail,
              notes: it.notes ?? payload.notes ?? null,
              recordedBy: processedBy,
              recordedAt: receiptDate,
            },
          }
        );

        const createdUnits = await createEquipmentUnitsRaw(
          {
            gymId,
            equipmentId,
            quantity,
            notes: `Inbound receipt ${code}`,
          },
          t
        );

        await logEquipmentUnitEvents(
          createdUnits.map((unit) => ({
            equipmentUnitId: unit.id,
            equipmentId,
            gymId,
            eventType: "created",
            referenceType: "receipt",
            referenceId: Number(receipt.id),
            performedBy: processedBy,
            notes: `Nhập kho qua phiếu ${code}`,
            metadata: {
              receiptCode: code,
              source: "admin_inventory_receipt",
            },
            eventAt: receiptDateObj,
          })),
          { transaction: t }
        );
      }

      await db.sequelize.query(
        `UPDATE \`${receiptTable}\` SET totalValue = :totalValue, updatedAt = NOW() WHERE id = :id`,
        {
          type: QueryTypes.UPDATE,
          transaction: t,
          replacements: { id: Number(receipt.id), totalValue: Number(totalValue) || 0 },
        }
      );

      const afterReceipt = await selectById(receiptTable, receipt.id, t);
      return afterReceipt;
    });
  },

  // =====================================================================
  // ✅ XUẤT KHO (Adjustment/Export)
  // =====================================================================
  async createExport(payload = {}, auditMeta = {}) {
    const invTable = tbl(db.Inventory, "Inventory");
    const gymId = payload.gymId ? Number(payload.gymId) : null;
    const equipmentId = Number(payload.equipmentId);
    const qty = Number(payload.quantity ?? 0);

    if (!gymId) throw new Error("gymId is required");
    if (!equipmentId || qty <= 0) throw new Error("Invalid export payload");

    const reason = String(payload.reason || "other");
    const transactionType = reason === "transfer_out" ? "transfer_out" : "adjustment";

    const recordedBy = auditMeta.actorUserId
      ? Number(auditMeta.actorUserId)
      : payload.recordedBy
      ? Number(payload.recordedBy)
      : null;

    const recordedAt = toMySqlDateTimeVN(new Date());
    const transactionCode = String(payload.transactionCode || `EXP-${Date.now()}`);

    return db.sequelize.transaction(async (t) => {
      const stock = await getOrCreateStockRaw({ gymId, equipmentId }, t);
      const beforeAvail = Number(stock.availableQuantity || 0);
      const beforeQty = Number(stock.quantity || 0);

      if (beforeAvail < qty) throw new Error("Not enough availableQuantity");

      const units = await db.EquipmentUnit.findAll({
        where: {
          gymId,
          equipmentId,
          status: "active",
          transferId: null,
        },
        order: [["id", "ASC"]],
        limit: qty,
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (units.length < qty) {
        throw new Error("Not enough active equipment units");
      }

      const afterAvail = beforeAvail - qty;
      const afterQty = Math.max(0, beforeQty - qty);

      const stTable = tbl(db.EquipmentStock, "EquipmentStock");
      await db.sequelize.query(
        `UPDATE \`${stTable}\`
         SET availableQuantity = :afterAvail,
             quantity = :afterQty,
             updatedAt = NOW()
         WHERE id = :id`,
        {
          type: QueryTypes.UPDATE,
          transaction: t,
          replacements: { id: Number(stock.id), afterAvail, afterQty },
        }
      );

      await db.EquipmentUnit.update(
        {
          status: "disposed",
          transferId: null,
          notes: payload.notes ?? reason ?? null,
        },
        {
          where: { id: { [db.Sequelize.Op.in]: units.map((unit) => unit.id) } },
          transaction: t,
        }
      );

      await logEquipmentUnitEvents(
        units.map((unit) => ({
          equipmentUnitId: unit.id,
          equipmentId,
          gymId,
          eventType: "disposed",
          referenceType: "inventory_export",
          referenceId: null,
          performedBy: recordedBy,
          notes: payload.notes ?? reason ?? null,
          metadata: {
            transactionCode,
            reason,
            source: "admin_inventory_export",
          },
          eventAt: recordedAt,
        })),
        { transaction: t }
      );

      await db.sequelize.query(
        `INSERT INTO \`${invTable}\`
          (equipmentId, gymId, transactionType, transactionId, transactionCode,
           quantity, unitPrice, totalValue, stockBefore, stockAfter, notes,
           recordedBy, recordedAt, createdAt, updatedAt)
         VALUES
          (:equipmentId, :gymId, :transactionType, NULL, :transactionCode,
           :qty, NULL, NULL, :stockBefore, :stockAfter, :notes,
           :recordedBy, :recordedAt, NOW(), NOW())`,
        {
          type: QueryTypes.INSERT,
          transaction: t,
          replacements: {
            equipmentId,
            gymId,
            transactionType,
            transactionCode,
            qty: -Math.abs(qty),
            stockBefore: beforeAvail,
            stockAfter: afterAvail,
            notes: payload.notes ?? reason ?? null,
            recordedBy,
            recordedAt,
          },
        }
      );

      const after = await selectById(stTable, stock.id, t);
      return after;
    });
  },

  // =====================================================================
// ✅ NHẬT KÝ KHO (KHÔNG JOIN user để tránh lỗi cột gymId trong bảng user)
// =====================================================================
async getInventoryLogs(query = {}) {
  const { page, limit, offset } = pickPage(query);
  const q = String(query.q || "").trim();
  const transactionType =
    query.transactionType && query.transactionType !== "all" ? String(query.transactionType) : null;

  const invTable = tbl(db.Inventory, "Inventory");
  const eqTable = tbl(db.Equipment, "Equipment");
  const gymTable = tbl(db.Gym, "Gym");

  const where = [];
  const params = {};

  if (q) {
    where.push(`(
      e.name LIKE :q OR e.code LIKE :q OR
      g.name LIKE :q OR
      i.transactionType LIKE :q OR
      i.transactionCode LIKE :q OR
      i.notes LIKE :q
    )`);
    params.q = qLike(q);
  }

  if (transactionType) {
    where.push(`i.transactionType = :transactionType`);
    params.transactionType = transactionType;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows, countRows] = await Promise.all([
    db.sequelize.query(
      `
      SELECT
        i.*,
        e.name AS equipmentName,
        e.code AS equipmentCode,
        g.name AS gymName
      FROM \`${invTable}\` i
      LEFT JOIN \`${eqTable}\` e ON e.id = i.equipmentId
      LEFT JOIN \`${gymTable}\` g ON g.id = i.gymId
      ${whereSql}
      ORDER BY i.id DESC
      LIMIT :limit OFFSET :offset
      `,
      { type: QueryTypes.SELECT, replacements: { ...params, limit, offset } }
    ),
    db.sequelize.query(
      `
      SELECT COUNT(*) AS total
      FROM \`${invTable}\` i
      LEFT JOIN \`${eqTable}\` e ON e.id = i.equipmentId
      LEFT JOIN \`${gymTable}\` g ON g.id = i.gymId
      ${whereSql}
      `,
      { type: QueryTypes.SELECT, replacements: params }
    ),
  ]);

  const totalItems = Number(countRows?.[0]?.total || 0);
  return normalizeList(rows, totalItems, page, limit);
},

  // ================== EQUIPMENT IMAGES ==================
// ================== EQUIPMENT IMAGES ==================
async getEquipmentImages(equipmentId) {
  const id = Number(equipmentId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid equipmentId");

  // ✅ CHỈ LẤY id để tránh Sequelize tự select gymId (do association)
  const equipment = await db.Equipment.findByPk(id, { attributes: ["id"] });
  if (!equipment) throw new Error("Equipment not found");

  const rows = await db.EquipmentImage.findAll({
    where: { equipmentId: id },
    order: [
      ["isPrimary", "DESC"],
      ["sortOrder", "ASC"],
      ["id", "ASC"],
    ],
  });

  return { data: rows };
},



  async uploadEquipmentImages(equipmentId, files = []) {
    const id = Number(equipmentId);
    if (!id) throw new Error("Invalid equipmentId");
    if (!files.length) throw new Error("No files uploaded");

    const equipment = await db.Equipment.findByPk(id, { attributes: ["id"] });

    if (!equipment) throw new Error("Equipment not found");

    const hasPrimary = await db.EquipmentImage.count({
      where: { equipmentId: id, isPrimary: true },
    });

    // ✅ Upload to Cloudinary (do NOT store on local disk)
    const uploaded = [];
    for (const f of files) {
      const buffer = normalizeUploadBuffer(f);
      if (!buffer) throw new Error("Invalid uploaded file");
      const r = await cloudinaryService.uploadImageBuffer(buffer, {
        folder: "gfms/equipments",
        filename: f.originalname,
      });
      uploaded.push({ file: f, cloud: r });
    }

    const rows = uploaded.map(({ file, cloud }, idx) => ({
      equipmentId: id,
      url: cloud.secure_url,
      publicId: cloud.public_id,
      isPrimary: hasPrimary === 0 && idx === 0,
      sortOrder: 0,
      altText: file.originalname || null,
    }));

    const created = await db.EquipmentImage.bulkCreate(rows);
    return { data: created };
  },

  async setPrimaryEquipmentImage(equipmentId, imageId) {
    const eqId = Number(equipmentId);
    const imgId = Number(imageId);
    if (!eqId || !imgId) throw new Error("Invalid id");

    const img = await db.EquipmentImage.findOne({ where: { id: imgId, equipmentId: eqId } });
    if (!img) throw new Error("Image not found");

    await db.sequelize.transaction(async (t) => {
      await db.EquipmentImage.update(
        { isPrimary: false },
        { where: { equipmentId: eqId }, transaction: t }
      );

      await db.EquipmentImage.update(
        { isPrimary: true },
        { where: { id: imgId }, transaction: t }
      );
    });

    return { message: "Primary image updated" };
  },

  async deleteEquipmentImage(equipmentId, imageId) {
    const eqId = Number(equipmentId);
    const imgId = Number(imageId);
    if (!eqId || !imgId) throw new Error("Invalid id");

    const img = await db.EquipmentImage.findOne({ where: { id: imgId, equipmentId: eqId } });
    if (!img) throw new Error("Image not found");

    const wasPrimary = !!img.isPrimary;

    const publicId = img.publicId;
    await img.destroy();

    // Best-effort cleanup on Cloudinary
    try {
      if (publicId) await cloudinaryService.destroy(publicId, "image");
    } catch (_) {}

    if (wasPrimary) {
      const next = await db.EquipmentImage.findOne({
        where: { equipmentId: eqId },
        order: [["sortOrder", "ASC"], ["id", "ASC"]],
      });
      if (next) await next.update({ isPrimary: true });
    }

    return { message: "Image deleted" };
  },

};

module.exports = adminInventoryService;
