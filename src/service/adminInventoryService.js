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

// ✅ chỉ lấy field tồn tại trong model (tránh Unknown column khi create/update)
const pickByModel = (model, payload = {}) => {
  const allowed = new Set(Object.keys(model.rawAttributes || {}));
  const out = {};
  for (const k of Object.keys(payload)) {
    if (allowed.has(k)) out[k] = payload[k];
  }
  return out;
};

// ✅ map supplier payload: FE gửi phone/email nhưng có thể lỡ gửi contactPhone/contactEmail
const normalizeSupplierPayload = (payload = {}) => {
  const p = { ...payload };
  if (p.phone == null && p.contactPhone != null) p.phone = p.contactPhone;
  if (p.email == null && p.contactEmail != null) p.email = p.contactEmail;

  // dọn rác
  delete p.contactPhone;
  delete p.contactEmail;
  delete p.contactPerson;
  delete p.products;
  delete p.rating;
  delete p.paymentTerms;
  delete p.deliveryTerms;
  return p;
};

// ✅ dọn rác equipment (nếu lỡ bị gửi lên)
const normalizeEquipmentPayload = (payload = {}) => {
  const p = { ...payload };
  delete p.gymId;
  delete p.supplierId;
  return p;
};

const adminInventoryService = {
  // ================== EQUIPMENT CATEGORIES ==================
  async getEquipmentCategories() {
    const table = tbl(db.EquipmentCategory);
    const rows = await db.sequelize.query(
      `SELECT * FROM \`${table}\` ORDER BY name ASC`,
      { type: QueryTypes.SELECT }
    );
    return { data: rows };
  },

  // ================== EQUIPMENTS (READ) ==================
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
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    return { data: rows, meta: { page, limit, totalItems, totalPages } };
  },

  // ================== SUPPLIERS (READ) ==================
  async getSuppliers(query = {}) {
    const { page, limit, offset } = pickPage(query);
    const q = String(query.q || "").trim();

    const table = tbl(db.Supplier);
    const where = [];
    const params = {};

    if (q) {
      where.push(`(name LIKE :q OR code LIKE :q OR phone LIKE :q OR email LIKE :q)`);
      params.q = qLike(q);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows, countRows] = await Promise.all([
      db.sequelize.query(
        `SELECT * FROM \`${table}\` ${whereSql} ORDER BY id DESC LIMIT :limit OFFSET :offset`,
        { type: QueryTypes.SELECT, replacements: { ...params, limit, offset } }
      ),
      db.sequelize.query(
        `SELECT COUNT(*) AS total FROM \`${table}\` ${whereSql}`,
        { type: QueryTypes.SELECT, replacements: params }
      ),
    ]);

    const totalItems = Number(countRows?.[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    return { data: rows, meta: { page, limit, totalItems, totalPages } };
  },

  // ================== STOCKS (READ) ==================
  async getStocks(query = {}) {
    const { page, limit, offset } = pickPage(query);
    const q = String(query.q || "").trim();

    const stTable = tbl(db.EquipmentStock);
    const eqTable = db.Equipment ? tbl(db.Equipment) : null;
    const gymTable = db.Gym ? tbl(db.Gym) : null;

    const where = [];
    const params = {};

    if (query.gymId) {
      where.push(`s.gymId = :gymId`);
      params.gymId = Number(query.gymId);
    }
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
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    return { data: rows, meta: { page, limit, totalItems, totalPages } };
  },

  // ================== EQUIPMENT (C/R/D) ==================
  async createEquipment(payload) {
    const clean = pickByModel(db.Equipment, normalizeEquipmentPayload(payload));
    if (!String(clean.name || "").trim()) throw new Error("name is required");

    // ✅ chỉ insert đúng field DB có
    const created = await db.Equipment.create(clean, { fields: Object.keys(clean) });
    return created;
  },

  async updateEquipment(id, payload) {
    const clean = pickByModel(db.Equipment, normalizeEquipmentPayload(payload));
    const eq = await db.Equipment.findByPk(id);
    if (!eq) return null;

    await eq.update(clean, { fields: Object.keys(clean) });
    return eq;
  },

  async discontinueEquipment(id) {
    const eq = await db.Equipment.findByPk(id);
    if (!eq) return null;
    await eq.update({ status: "discontinued" }, { fields: ["status"] });
    return eq;
  },

  // ================== SUPPLIER (C/R/D) ==================
  async createSupplier(payload) {
    const clean = pickByModel(db.Supplier, normalizeSupplierPayload(payload));
    if (!String(clean.name || "").trim()) throw new Error("name is required");

    const created = await db.Supplier.create(clean, { fields: Object.keys(clean) });
    return created;
  },

  async updateSupplier(id, payload) {
    const clean = pickByModel(db.Supplier, normalizeSupplierPayload(payload));
    const s = await db.Supplier.findByPk(id);
    if (!s) return null;

    await s.update(clean, { fields: Object.keys(clean) });
    return s;
  },

  async setSupplierActive(id, isActive) {
    const s = await db.Supplier.findByPk(id);
    if (!s) return null;

    await s.update({ isActive: !!isActive }, { fields: ["isActive"] });
    return s;
  },

  // ================== IMPORT / EXPORT ==================
  async createReceiptImport(payload) {
    // (giữ như bạn đang làm – nếu cần mình sẽ chuẩn hóa tiếp khi bạn gửi lỗi import/export)
    // Bạn đang dùng equipmentStock có gymId nên phần này ok.
    return { message: "TODO: import logic (đang dùng bản của bạn)" };
  },

  async createExport(payload) {
    return { message: "TODO: export logic (đang dùng bản của bạn)" };
  },
};

module.exports = adminInventoryService;
