import { Op, QueryTypes } from "sequelize";
import db from "../models";

const pickPage = (query) => {
  const page = Math.max(1, parseInt(query.page || "1", 10));
  const limit = Math.max(1, Math.min(200, parseInt(query.limit || "10", 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

// ✅ lấy đúng tên bảng mà model hiện tại đang map tới (dù model bạn đặt gì)
const tbl = (model) => {
  const t = model.getTableName();
  // sequelize có thể trả object { tableName, schema }
  if (typeof t === "string") return t;
  return t?.tableName || t;
};

const qLike = (s) => `%${String(s || "").trim()}%`;

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

  // ================== EQUIPMENTS ==================
  async getEquipments(query) {
    const { page, limit, offset } = pickPage(query);
    const q = String(query.q || "").trim();
    const status = query.status && query.status !== "all" ? String(query.status) : null;
    const categoryId = query.categoryId ? Number(query.categoryId) : null;

    const eqTable = tbl(db.Equipment);
    const catTable = db.EquipmentCategory ? tbl(db.EquipmentCategory) : null;

    // build where SQL (không phụ thuộc field mapping)
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

    // join category nếu có
    const joinSql = catTable
      ? `LEFT JOIN \`${catTable}\` c ON c.id = e.categoryId`
      : "";

    const selectSql = `SELECT 
      e.*, 
      ${catTable ? "c.name AS categoryName" : "NULL AS categoryName"}
    FROM \`${eqTable}\` e
    ${joinSql}
    ${whereSql}
    ORDER BY e.id DESC
    LIMIT :limit OFFSET :offset`;

    const countSql = `SELECT COUNT(*) AS total
      FROM \`${eqTable}\` e
      ${whereSql}`;

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
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    return { data: rows, meta: { page, limit, totalItems, totalPages } };
  },

  // ================== SUPPLIERS ==================
  async getSuppliers(query) {
    const { page, limit, offset } = pickPage(query);
    const q = String(query.q || "").trim();

    const table = tbl(db.Supplier);

    const where = [];
    const params = {};

    if (q) {
      where.push(`(name LIKE :q OR code LIKE :q)`);
      params.q = qLike(q);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const rows = await db.sequelize.query(
      `SELECT * FROM \`${table}\` ${whereSql} ORDER BY id DESC LIMIT :limit OFFSET :offset`,
      {
        type: QueryTypes.SELECT,
        replacements: { ...params, limit, offset },
      }
    );

    const countRows = await db.sequelize.query(
      `SELECT COUNT(*) AS total FROM \`${table}\` ${whereSql}`,
      {
        type: QueryTypes.SELECT,
        replacements: params,
      }
    );

    const totalItems = Number(countRows?.[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    const mapped = rows.map((s) => ({
      ...s,
      phone: s.phone ?? s.contactPhone ?? s.contact_phone ?? null,
      email: s.email ?? s.contactEmail ?? s.contact_email ?? null,
      status:
        s.status ??
        (s.isActive ?? s.is_active) === true
          ? "active"
          : (s.isActive ?? s.is_active) === false
          ? "inactive"
          : null,
    }));

    return { data: mapped, meta: { page, limit, totalItems, totalPages } };
  },

  // ================== STOCKS ==================
  async getStocks(query) {
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
      {
        type: QueryTypes.SELECT,
        replacements: { ...params, limit, offset },
      }
    );

    const countRows = await db.sequelize.query(
      `SELECT COUNT(*) AS total FROM \`${stTable}\` s`,
      { type: QueryTypes.SELECT }
    );

    const totalItems = Number(countRows?.[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    const mapped = rows.map((r) => ({
      ...r,
      gym: r.gymName || r.gym || null,
      equipment: r.equipmentName || r.equipment || null,
      code: r.equipmentCode || r.code || null,
      available: r.availableQuantity ?? r.available_quantity ?? r.available ?? 0,
      reserved: r.reservedQuantity ?? r.reserved_quantity ?? r.reserved ?? 0,
      damaged: r.damagedQuantity ?? r.damaged_quantity ?? r.damaged ?? 0,
      maintenance: r.maintenanceQuantity ?? r.maintenance_quantity ?? r.maintenance ?? 0,
      min: r.minStockLevel ?? r.min_stock_level ?? r.min ?? 0,
      reorder: r.reorderPoint ?? r.reorder_point ?? r.reorder ?? 0,
    }));

    return { data: mapped, meta: { page, limit, totalItems, totalPages } };
  },

  // ================== CREATE & UPDATE EQUIPMENT ==================
  async createEquipment(payload) {
    const equipment = await db.Equipment.create(payload);
    return equipment;
  },

  async updateEquipment(id, payload) {
    const equipment = await db.Equipment.findByPk(id);
    if (!equipment) return null;
    await equipment.update(payload);
    return equipment;
  },

  // ================== DISCONTINUE EQUIPMENT ==================
  async discontinueEquipment(id) {
    const equipment = await db.Equipment.findByPk(id);
    if (!equipment) return null;
    await equipment.update({ status: "discontinued" });
    return equipment;
  },

  // ================== CREATE & UPDATE SUPPLIERS ==================
  async createSupplier(payload) {
    const supplier = await db.Supplier.create(payload);
    return supplier;
  },

  async updateSupplier(id, payload) {
    const supplier = await db.Supplier.findByPk(id);
    if (!supplier) return null;
    await supplier.update(payload);
    return supplier;
  },
};

module.exports = adminInventoryService;
