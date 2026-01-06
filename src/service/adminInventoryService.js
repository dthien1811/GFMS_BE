import { QueryTypes } from "sequelize";
import db from "../models";

const pickPage = (query = {}) => {
  const page = Math.max(1, parseInt(query.page || "1", 10));
  const limit = Math.max(1, Math.min(200, parseInt(query.limit || "10", 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const tbl = (model) => {
  const t = model.getTableName();
  if (typeof t === "string") return t;
  return t?.tableName || t;
};

const qLike = (s) => `%${String(s || "").trim()}%`;

const normalizeList = (rows, totalItems, page, limit) => {
  const totalPages = Math.max(1, Math.ceil(Number(totalItems || 0) / limit));
  return { data: rows, meta: { page, limit, totalItems: Number(totalItems || 0), totalPages } };
};

// ===== whitelist payload để không dính cột rác =====
const pickEquipmentPayload = (payload = {}) => {
  const allowed = [
    "name",
    "code",
    "description",
    "categoryId",
    "brand",
    "model",
    "specifications",
    "unit",
    "minStockLevel",
    "maxStockLevel",
    "status",
  ];
  const out = {};
  for (const k of allowed) {
    if (payload[k] !== undefined) out[k] = payload[k];
  }
  // chặn tuyệt đối gymId/supplierId (dù FE có gửi nhầm)
  delete out.gymId;
  delete out.supplierId;
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
  const rows = await db.sequelize.query(
    `SELECT * FROM \`${table}\` WHERE id = :id LIMIT 1`,
    {
      type: QueryTypes.SELECT,
      replacements: { id: Number(id) },
      transaction,
    }
  );
  return rows?.[0] || null;
};

const getOrCreateStock = async (gymId, equipmentId, transaction) => {
  const [stock] = await db.EquipmentStock.findOrCreate({
    where: { gymId, equipmentId },
    defaults: {
      gymId,
      equipmentId,
      quantity: 0,
      availableQuantity: 0,
      reservedQuantity: 0,
      damagedQuantity: 0,
      maintenanceQuantity: 0,
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  return stock;
};

/**
 * ============================================================
 * ✅ SUPPLIER FIX (TRIPLE CHECK)
 * - Không hardcode isActive/contactPhone/contactEmail nữa
 * - Tự dò cột thật trong Supplier bằng SHOW COLUMNS
 * - Chặn id NaN/undefined => hết "Unknown column 'NaN'..."
 * ============================================================
 */
let SUPPLIER_META = null;

const toId = (id) => {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid supplier id: ${id}`);
  return n;
};

const loadSupplierMeta = async () => {
  if (SUPPLIER_META) return SUPPLIER_META;

  const cols = await db.sequelize.query("SHOW COLUMNS FROM `Supplier`", {
    type: QueryTypes.SELECT,
  });

  const schema = cols.map((c) => ({
    name: c.Field,
    type: String(c.Type || "").toLowerCase(),
  }));

  const colNames = new Set(schema.map((c) => c.name));

  const phoneCol = colNames.has("phone")
    ? "phone"
    : colNames.has("contactPhone")
    ? "contactPhone"
    : colNames.has("contact_phone")
    ? "contact_phone"
    : null;

  const emailCol = colNames.has("email")
    ? "email"
    : colNames.has("contactEmail")
    ? "contactEmail"
    : colNames.has("contact_email")
    ? "contact_email"
    : null;

  // detect cột trạng thái (nếu DB có)
  const activeCandidates = ["isActive", "is_active", "active", "status"];
  const activeCol = activeCandidates.find((c) => colNames.has(c)) || null;
  const activeColType = activeCol ? schema.find((x) => x.name === activeCol)?.type || "" : "";

  const hasUpdatedAt = colNames.has("updatedAt");
  const hasCreatedAt = colNames.has("createdAt");

  SUPPLIER_META = { schema, colNames, phoneCol, emailCol, activeCol, activeColType, hasUpdatedAt, hasCreatedAt };
  return SUPPLIER_META;
};

const activeValueFromBool = (meta, boolVal) => {
  if (!meta.activeCol) return undefined;

  // status kiểu string -> 'active'/'inactive'
  if (meta.activeCol === "status") return boolVal ? "active" : "inactive";

  const t = meta.activeColType || "";
  if (t.includes("enum") || t.includes("varchar") || t.includes("char")) {
    return boolVal ? "active" : "inactive";
  }
  return boolVal ? 1 : 0;
};

const mapIsActiveFromRow = (meta, row) => {
  if (!meta.activeCol) return true;

  const v = row?.[meta.activeCol];

  if (meta.activeCol === "status") return String(v || "").toLowerCase() === "active";

  const t = meta.activeColType || "";
  if (t.includes("enum") || t.includes("varchar") || t.includes("char")) {
    return String(v || "").toLowerCase() === "active";
  }
  return v === true || v === 1 || v === "1";
};

const pickSupplierCleanForDB = async (payload = {}) => {
  const meta = await loadSupplierMeta();

  const clean = {};

  if (payload.name !== undefined) clean.name = payload.name;
  if (payload.code !== undefined) clean.code = payload.code;

  if (meta.phoneCol) {
    const phone = payload.phone ?? payload.contactPhone ?? payload.contact_phone ?? null;
    if (phone !== undefined) clean[meta.phoneCol] = phone;
  }
  if (meta.emailCol) {
    const email = payload.email ?? payload.contactEmail ?? payload.contact_email ?? null;
    if (email !== undefined) clean[meta.emailCol] = email;
  }

  if (payload.address !== undefined) clean.address = payload.address ?? null;
  if (payload.taxCode !== undefined) clean.taxCode = payload.taxCode ?? null;
  if (payload.notes !== undefined) clean.notes = payload.notes ?? null;

  // chỉ set active nếu DB có cột và FE gửi
  if (meta.activeCol && payload.isActive !== undefined) {
    clean[meta.activeCol] = activeValueFromBool(meta, !!payload.isActive);
  }

  // chỉ giữ cột tồn tại trong DB
  const filtered = {};
  for (const k of Object.keys(clean)) {
    if (meta.colNames.has(k) && clean[k] !== undefined) filtered[k] = clean[k];
  }

  return { meta, clean: filtered };
};

const selectSupplierById = async (id) => {
  const n = toId(id);
  const rows = await db.sequelize.query("SELECT * FROM `Supplier` WHERE id = :id LIMIT 1", {
    type: QueryTypes.SELECT,
    replacements: { id: n },
  });
  return rows?.[0] || null;
};

const adminInventoryService = {
  // ================== CATEGORIES ==================
  async getEquipmentCategories() {
    const table = tbl(db.EquipmentCategory);
    const rows = await db.sequelize.query(
      `SELECT * FROM \`${table}\` ORDER BY name ASC`,
      { type: QueryTypes.SELECT }
    );
    return { data: rows };
  },

  // ================== EQUIPMENTS (READ raw SQL) ==================
  async getEquipments(query = {}) {
    const { page, limit, offset } = pickPage(query);
    const q = String(query.q || "").trim();
    const status = query.status && query.status !== "all" ? String(query.status) : null;
    const categoryId = query.categoryId ? Number(query.categoryId) : null;

    const eqTable = tbl(db.Equipment);
    const catTable = db.EquipmentCategory ? tbl(db.EquipmentCategory) : null;

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
    const joinSql = catTable ? `LEFT JOIN \`${catTable}\` c ON c.id = e.categoryId` : "";

    const [rows, countRows] = await Promise.all([
      db.sequelize.query(
        `SELECT e.*, ${catTable ? "c.name AS categoryName" : "NULL AS categoryName"}
         FROM \`${eqTable}\` e
         ${joinSql}
         ${whereSql}
         ORDER BY e.id DESC
         LIMIT :limit OFFSET :offset`,
        { type: QueryTypes.SELECT, replacements: { ...params, limit, offset } }
      ),
      db.sequelize.query(
        `SELECT COUNT(*) AS total FROM \`${eqTable}\` e ${whereSql}`,
        { type: QueryTypes.SELECT, replacements: params }
      ),
    ]);

    const totalItems = Number(countRows?.[0]?.total || 0);
    return normalizeList(rows, totalItems, page, limit);
  },

  // ================== SUPPLIERS (READ raw SQL) ✅ FIX ==================
  async getSuppliers(query = {}) {
    const { page, limit, offset } = pickPage(query);
    const q = String(query.q || "").trim();
    const meta = await loadSupplierMeta();

    const where = [];
    const params = {};

    if (q) {
      const searchCols = ["name", "code"];
      if (meta.phoneCol) searchCols.push(meta.phoneCol);
      if (meta.emailCol) searchCols.push(meta.emailCol);

      where.push(`(${searchCols.map((c) => `\`${c}\` LIKE :q`).join(" OR ")})`);
      params.q = qLike(q);
    }

    // filter active chỉ khi DB có cột trạng thái
    if (query.isActive !== undefined && meta.activeCol) {
      const boolVal = query.isActive === true || query.isActive === "true";
      where.push(`\`${meta.activeCol}\` = :activeVal`);
      params.activeVal = activeValueFromBool(meta, boolVal);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows, countRows] = await Promise.all([
      db.sequelize.query(
        `SELECT * FROM \`Supplier\` ${whereSql} ORDER BY id DESC LIMIT :limit OFFSET :offset`,
        { type: QueryTypes.SELECT, replacements: { ...params, limit, offset } }
      ),
      db.sequelize.query(
        `SELECT COUNT(*) AS total FROM \`Supplier\` ${whereSql}`,
        { type: QueryTypes.SELECT, replacements: params }
      ),
    ]);

    const totalItems = Number(countRows?.[0]?.total || 0);

    const mapped = rows.map((s) => ({
      ...s,
      phone: meta.phoneCol ? s?.[meta.phoneCol] ?? null : null,
      email: meta.emailCol ? s?.[meta.emailCol] ?? null : null,
      isActive: mapIsActiveFromRow(meta, s),
    }));

    return normalizeList(mapped, totalItems, page, limit);
  },

  // ================== EQUIPMENT (C/R/D) ==================
  async createEquipment(payload /*, auditMeta */) {
    const clean = pickEquipmentPayload(payload);
    if (!String(clean.name || "").trim()) throw new Error("name is required");

    const created = await db.Equipment.create(clean, { fields: Object.keys(clean) });
    return created;
  },

  // ✅ FIX CHÍNH: UPDATE bằng SQL để không bị Sequelize lôi gymId
  async updateEquipment(id, payload /*, auditMeta */) {
    const table = tbl(db.Equipment);
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
    if (!after) return null;
    return after;
  },

  // ✅ FIX CHÍNH: Xoá mềm bằng SQL (chỉ set status)
  async discontinueEquipment(id /*, auditMeta */) {
    const table = tbl(db.Equipment);
    await db.sequelize.query(
      `UPDATE \`${table}\` SET status = 'discontinued', updatedAt = NOW() WHERE id = :id`,
      { type: QueryTypes.UPDATE, replacements: { id: Number(id) } }
    );

    const after = await selectById(table, id);
    if (!after) return null;
    return after;
  },

  // ================== SUPPLIER (C/R/U) ✅ FIX: dùng RAW SQL (không Sequelize validate/model) ==================
  async createSupplier(payload /*, auditMeta */) {
    const { meta, clean } = await pickSupplierCleanForDB(payload);

    if (!String(clean.name || "").trim()) throw new Error("name is required");

    if (meta.hasCreatedAt && clean.createdAt === undefined) clean.createdAt = new Date();
    if (meta.hasUpdatedAt && clean.updatedAt === undefined) clean.updatedAt = new Date();

    const keys = Object.keys(clean);
    if (!keys.length) throw new Error("No valid columns to insert Supplier");

    const sql = `INSERT INTO \`Supplier\` (${keys.map((k) => `\`${k}\``).join(", ")})
                 VALUES (${keys.map((k) => `:${k}`).join(", ")})`;

    const [result] = await db.sequelize.query(sql, {
      type: QueryTypes.INSERT,
      replacements: clean,
    });

    // mysql2 có thể trả insertId khác nhau tuỳ version
    const insertedId =
      result?.insertId ??
      result?.[0]?.insertId ??
      result?.[1]?.insertId;

    if (!insertedId) {
      const fallback = await db.sequelize.query(
        "SELECT * FROM `Supplier` ORDER BY id DESC LIMIT 1",
        { type: QueryTypes.SELECT }
      );
      return fallback?.[0] || { message: "Created but cannot resolve insertedId" };
    }

    return await selectSupplierById(insertedId);
  },

  async updateSupplier(id, payload /*, auditMeta */) {
    const supplierId = toId(id);
    const { meta, clean } = await pickSupplierCleanForDB(payload);
    delete clean.id;

    if (clean.name !== undefined && !String(clean.name || "").trim()) {
      throw new Error("name is required");
    }

    if (meta.hasUpdatedAt) clean.updatedAt = new Date();

    const keys = Object.keys(clean);
    if (keys.length) {
      const sets = keys.map((k) => `\`${k}\` = :${k}`).join(", ");
      const sql = `UPDATE \`Supplier\` SET ${sets} WHERE id = :id`;

      await db.sequelize.query(sql, {
        type: QueryTypes.UPDATE,
        replacements: { ...clean, id: supplierId },
      });
    }

    return await selectSupplierById(supplierId);
  },

  async setSupplierActive(id, isActive /*, auditMeta */) {
    const supplierId = toId(id);
    const meta = await loadSupplierMeta();

    if (!meta.activeCol) {
      throw new Error(
        "Supplier table has no active/status column (isActive/is_active/active/status). Không thể bật/tắt trạng thái."
      );
    }

    const val = activeValueFromBool(meta, !!isActive);

    const parts = [`\`${meta.activeCol}\` = :val`];
    const replacements = { id: supplierId, val };

    if (meta.hasUpdatedAt) {
      parts.push("`updatedAt` = :updatedAt");
      replacements.updatedAt = new Date();
    }

    await db.sequelize.query(
      `UPDATE \`Supplier\` SET ${parts.join(", ")} WHERE id = :id`,
      { type: QueryTypes.UPDATE, replacements }
    );

    return await selectSupplierById(supplierId);
  },

  // ================== STOCKS (READ raw SQL) ==================
  async getStocks(query = {}) {
    const { page, limit, offset } = pickPage(query);
    const q = String(query.q || "").trim();

    const stTable = tbl(db.EquipmentStock);
    const eqTable = db.Equipment ? tbl(db.Equipment) : null;
    const gymTable = db.Gym ? tbl(db.Gym) : null;

    const where = [];
    const params = {};

    if (q && eqTable) {
      where.push(`(e.name LIKE :q OR e.code LIKE :q)`);
      params.q = qLike(q);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const joinEq = eqTable ? `LEFT JOIN \`${eqTable}\` e ON e.id = s.equipmentId` : "";
    const joinGym = gymTable ? `LEFT JOIN \`${gymTable}\` g ON g.id = s.gymId` : "";

    const rows = await db.sequelize.query(
      `
      SELECT 
        s.*,
        ${eqTable ? "e.name AS equipmentName, e.code AS equipmentCode" : "NULL AS equipmentName, NULL AS equipmentCode"},
        ${gymTable ? "g.name AS gymName" : "NULL AS gymName"}
      FROM \`${stTable}\` s
      ${joinEq}
      ${joinGym}
      ${whereSql}
      ORDER BY s.id DESC
      LIMIT :limit OFFSET :offset
      `,
      { type: QueryTypes.SELECT, replacements: { ...params, limit, offset } }
    );

    const countRows = await db.sequelize.query(
      `SELECT COUNT(*) AS total FROM \`${stTable}\` s`,
      { type: QueryTypes.SELECT }
    );

    const totalItems = Number(countRows?.[0]?.total || 0);
    return normalizeList(rows, totalItems, page, limit);
  },

  // ================== IMPORT (Receipt) ==================
  async createReceiptImport(payload, auditMeta = {} /*, req */) {
    const gymId = payload.gymId ? Number(payload.gymId) : 1;
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) throw new Error("items is required");

    return db.sequelize.transaction(async (t) => {
      const receipt = await db.Receipt.create(
        {
          receiptNumber: payload.receiptNumber || `RC-${Date.now()}`,
          purchaseOrderId: payload.purchaseOrderId ?? null,
          gymId,
          receiptDate: payload.receiptDate ? new Date(payload.receiptDate) : new Date(),
          status: "received",
          totalQuantity: items.reduce((s, it) => s + Number(it.receivedQuantity || 0), 0),
          notes: payload.notes || null,
          receivedBy: auditMeta.actorUserId || null,
        },
        { transaction: t }
      );

      for (const it of items) {
        const equipmentId = Number(it.equipmentId);
        const receivedQuantity = Number(it.receivedQuantity || 0);
        if (!equipmentId || receivedQuantity <= 0) throw new Error("Invalid receipt item");

        const unitPrice = it.unitPrice === null || it.unitPrice === undefined ? null : Number(it.unitPrice);
        const totalPrice = unitPrice === null ? null : unitPrice * receivedQuantity;

        await db.ReceiptItem.create(
          {
            receiptId: receipt.id,
            equipmentId,
            orderedQuantity: it.orderedQuantity ?? receivedQuantity,
            receivedQuantity,
            unitPrice,
            totalPrice,
            condition: "good",
            notes: it.notes || null,
          },
          { transaction: t }
        );

        const stock = await getOrCreateStock(gymId, equipmentId, t);
        const before = Number(stock.availableQuantity || 0);

        await stock.update(
          {
            availableQuantity: before + receivedQuantity,
            quantity: Number(stock.quantity || 0) + receivedQuantity,
            lastRestocked: new Date(),
          },
          { transaction: t }
        );

        await db.Inventory.create(
          {
            equipmentId,
            gymId,
            action: "import",
            quantity: receivedQuantity,
            stockBefore: before,
            stockAfter: before + receivedQuantity,
            referenceType: "purchase_order",
            referenceId: receipt.id,
            purchaseOrderId: payload.purchaseOrderId ?? null,
            reason: "purchase",
            costPerUnit: unitPrice,
            totalCost: totalPrice,
            notes: payload.notes || null,
            createdBy: auditMeta.actorUserId || null,
          },
          { transaction: t }
        );
      }

      return receipt;
    });
  },

  // ================== EXPORT ==================
  async createExport(payload, auditMeta = {} /*, req */) {
    const gymId = payload.gymId ? Number(payload.gymId) : 1;
    const equipmentId = Number(payload.equipmentId);
    const quantity = Number(payload.quantity || 0);
    if (!equipmentId || quantity <= 0) throw new Error("Invalid export payload");

    return db.sequelize.transaction(async (t) => {
      const stock = await db.EquipmentStock.findOne({
        where: { gymId, equipmentId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!stock) throw new Error("Stock not found");

      const before = Number(stock.availableQuantity || 0);
      if (before < quantity) throw new Error("Not enough availableQuantity");

      await stock.update(
        {
          availableQuantity: before - quantity,
          quantity: Math.max(0, Number(stock.quantity || 0) - quantity),
        },
        { transaction: t }
      );

      await db.Inventory.create(
        {
          equipmentId,
          gymId,
          action: "export",
          quantity,
          stockBefore: before,
          stockAfter: before - quantity,
          referenceType: "adjustment",
          referenceId: null,
          reason: payload.reason || "other",
          notes: payload.notes || null,
          createdBy: auditMeta.actorUserId || null,
        },
        { transaction: t }
      );

      return stock;
    });
  },
};


module.exports = adminInventoryService;
