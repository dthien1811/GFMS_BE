import { QueryTypes } from "sequelize";
import db from "../models";

// ================= helpers =================
const pickPage = (query = {}) => {
  const page = Math.max(1, parseInt(query.page || "1", 10));
  const limit = Math.max(1, Math.min(200, parseInt(query.limit || "10", 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const tbl = (model, fallback) => {
  if (!model) return fallback;
  const t = model.getTableName();
  if (typeof t === "string") return t;
  return t?.tableName || fallback;
};

const qLike = (s) => `%${String(s || "").trim()}%`;

const normalizeList = (rows, totalItems, page, limit) => {
  const totalPages = Math.max(1, Math.ceil(Number(totalItems || 0) / limit));
  return { data: rows, meta: { page, limit, totalItems: Number(totalItems || 0), totalPages } };
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
  delete out.gymId;
  delete out.supplierId;
  return out;
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
  const stTable = tbl(db.EquipmentStock, "EquipmentStock");

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

    const eqTable = tbl(db.Equipment, "Equipment");
    const catTable = db.EquipmentCategory ? tbl(db.EquipmentCategory, "EquipmentCategory") : null;

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
      db.sequelize.query(`SELECT COUNT(*) AS total FROM \`${eqTable}\` e ${whereSql}`, {
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

    const where = [];
    const params = {};

    if (gymId) {
      where.push(`s.gymId = :gymId`);
      params.gymId = gymId;
    }

    if (q && eqTable) {
      where.push(`(e.name LIKE :q OR e.code LIKE :q OR g.name LIKE :q)`);
      params.q = qLike(q);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const joinEq = eqTable ? `LEFT JOIN \`${eqTable}\` e ON e.id = s.equipmentId` : "";
    const joinGym = gymTable ? `LEFT JOIN \`${gymTable}\` g ON g.id = s.gymId` : "";

    const [rows, countRows] = await Promise.all([
      db.sequelize.query(
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
      ),
      db.sequelize.query(
        `SELECT COUNT(*) AS total FROM \`${stTable}\` s ${whereSql}`,
        { type: QueryTypes.SELECT, replacements: params }
      ),
    ]);

    const totalItems = Number(countRows?.[0]?.total || 0);
    return normalizeList(rows, totalItems, page, limit);
  },

  // ================== EQUIPMENT (C/R/D) ==================
  async createEquipment(payload) {
    const clean = pickEquipmentPayload(payload);
    if (!String(clean.name || "").trim()) throw new Error("name is required");
    const created = await db.Equipment.create(clean, { fields: Object.keys(clean) });
    return created;
  },

  async updateEquipment(id, payload) {
    const table = tbl(db.Equipment, "Equipment");
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
  // ✅ NHẬT KÝ KHO (JOIN user để có người thao tác)
  // =====================================================================
  async getInventoryLogs(query = {}) {
    const { page, limit, offset } = pickPage(query);
    const q = String(query.q || "").trim();
    const transactionType =
      query.transactionType && query.transactionType !== "all" ? String(query.transactionType) : null;

    const invTable = tbl(db.Inventory, "Inventory");
    const eqTable = tbl(db.Equipment, "Equipment");
    const gymTable = tbl(db.Gym, "Gym");
    const userTable = tbl(db.User, "User");

    const where = [];
    const params = {};

    if (q) {
      where.push(`(
        e.name LIKE :q OR e.code LIKE :q OR
        g.name LIKE :q OR
        i.transactionType LIKE :q OR
        i.transactionCode LIKE :q OR
        i.notes LIKE :q OR
        u.username LIKE :q OR
        u.email LIKE :q
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
          g.name AS gymName,
          u.username AS recordedByName,
          u.email AS recordedByEmail
        FROM \`${invTable}\` i
        LEFT JOIN \`${eqTable}\` e ON e.id = i.equipmentId
        LEFT JOIN \`${gymTable}\` g ON g.id = i.gymId
        LEFT JOIN \`${userTable}\` u ON u.id = i.recordedBy
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
        LEFT JOIN \`${userTable}\` u ON u.id = i.recordedBy
        ${whereSql}
        `,
        { type: QueryTypes.SELECT, replacements: params }
      ),
    ]);

    const totalItems = Number(countRows?.[0]?.total || 0);
    return normalizeList(rows, totalItems, page, limit);
  },
};

module.exports = adminInventoryService;
