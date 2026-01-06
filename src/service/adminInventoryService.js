// src/service/adminInventoryService.js
import { QueryTypes } from "sequelize";
import db from "../models";

// =================== helpers ===================
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

const pickSupplierPayload = (payload = {}) => {
  const out = {
    name: payload.name,
    code: payload.code,
    phone: payload.phone ?? payload.contactPhone ?? null,
    email: payload.email ?? payload.contactEmail ?? null,
    address: payload.address ?? null,
    taxCode: payload.taxCode ?? null,
    notes: payload.notes ?? null,
    isActive: payload.isActive ?? true,
  };
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

// =================== dynamic columns resolver (FIX 4-5-6) ===================
const __colsCache = new Map();

const getCols = async (table) => {
  if (__colsCache.has(table)) return __colsCache.get(table);
  const cols = await db.sequelize.query(`SHOW COLUMNS FROM \`${table}\``, { type: QueryTypes.SELECT });
  const set = new Set(cols.map((c) => c.Field));
  __colsCache.set(table, set);
  return set;
};

const pickCol = async (table, candidates = []) => {
  const cols = await getCols(table);
  for (const c of candidates) {
    if (cols.has(c)) return c;
  }
  return null;
};

// =================== Service ===================
const adminInventoryService = {
  // ================== CATEGORIES ==================
  async getEquipmentCategories() {
    const table = tbl(db.EquipmentCategory);
    const rows = await db.sequelize.query(`SELECT * FROM \`${table}\` ORDER BY name ASC`, {
      type: QueryTypes.SELECT,
    });
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
      db.sequelize.query(`SELECT COUNT(*) AS total FROM \`${eqTable}\` e ${whereSql}`, {
        type: QueryTypes.SELECT,
        replacements: params,
      }),
    ]);

    const totalItems = Number(countRows?.[0]?.total || 0);
    return normalizeList(rows, totalItems, page, limit);
  },

  // ================== SUPPLIERS (READ raw SQL) ==================
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

    // ✅ IMPORTANT: nếu DB bạn không có isActive thì đừng filter theo isActive
    const hasIsActive = (await getCols(table)).has("isActive") || (await getCols(table)).has("is_active");
    if (hasIsActive && query.isActive !== undefined) {
      const colIsActive = (await pickCol(table, ["isActive", "is_active"])) || "isActive";
      where.push(`\`${colIsActive}\` = :isActive`);
      params.isActive = query.isActive === true || query.isActive === "true";
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows, countRows] = await Promise.all([
      db.sequelize.query(
        `SELECT * FROM \`${table}\` ${whereSql} ORDER BY id DESC LIMIT :limit OFFSET :offset`,
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

    const countRows = await db.sequelize.query(`SELECT COUNT(*) AS total FROM \`${stTable}\` s`, {
      type: QueryTypes.SELECT,
    });

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

  async discontinueEquipment(id) {
    const table = tbl(db.Equipment);
    await db.sequelize.query(
      `UPDATE \`${table}\` SET status = 'discontinued', updatedAt = NOW() WHERE id = :id`,
      { type: QueryTypes.UPDATE, replacements: { id: Number(id) } }
    );

    const after = await selectById(table, id);
    if (!after) return null;
    return after;
  },

  // ================== SUPPLIER (C/R/D) ==================
  async createSupplier(payload) {
    const clean = pickSupplierPayload(payload);
    if (!String(clean.name || "").trim()) throw new Error("name is required");
    const created = await db.Supplier.create(clean, { fields: Object.keys(clean) });
    return created;
  },

  async updateSupplier(id, payload) {
    const table = tbl(db.Supplier);
    const clean = pickSupplierPayload(payload);

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

  async setSupplierActive(id, isActive) {
    const table = tbl(db.Supplier);
    const colIsActive = (await pickCol(table, ["isActive", "is_active"])) || "isActive";
    await db.sequelize.query(
      `UPDATE \`${table}\` SET \`${colIsActive}\` = :isActive, updatedAt = NOW() WHERE id = :id`,
      { type: QueryTypes.UPDATE, replacements: { id: Number(id), isActive: !!isActive } }
    );
    const after = await selectById(table, id);
    if (!after) return null;
    return after;
  },

  // ================== (6) INVENTORY LOGS ==================
  async getInventoryLogs(query = {}) {
    const { page, limit, offset } = pickPage(query);
    const q = String(query.q || "").trim();
    const action = query.action ? String(query.action) : null;

    const invTable = tbl(db.Inventory);
    const eqTable = db.Equipment ? tbl(db.Equipment) : null;
    const gymTable = db.Gym ? tbl(db.Gym) : null;
    const userTable = db.User ? tbl(db.User) : null;

    // resolve real columns
    const invCreatedBy = (await pickCol(invTable, ["createdBy", "created_by"])) || null;
    const invCreatedAt = (await pickCol(invTable, ["createdAt", "created_at"])) || "createdAt";

    const where = [];
    const params = {};

    if (action) {
      where.push(`i.action = :action`);
      params.action = action;
    }

    if (q) {
      const like = qLike(q);
      const parts = [];
      parts.push(`i.reason LIKE :q`);
      parts.push(`CAST(i.referenceId AS CHAR) LIKE :q`);
      if (eqTable) parts.push(`e.name LIKE :q OR e.code LIKE :q`);
      if (gymTable) parts.push(`g.name LIKE :q`);
      where.push(`(${parts.join(" OR ")})`);
      params.q = like;
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const joinEq = eqTable ? `LEFT JOIN \`${eqTable}\` e ON e.id = i.equipmentId` : "";
    const joinGym = gymTable ? `LEFT JOIN \`${gymTable}\` g ON g.id = i.gymId` : "";

    // User không có fullName => dùng username/email
    let joinUser = "";
    let userSelect = "NULL AS createdByName";
    if (userTable && invCreatedBy) {
      joinUser = `LEFT JOIN \`${userTable}\` u ON u.id = i.\`${invCreatedBy}\``;
      userSelect = `COALESCE(u.username, u.email) AS createdByName`;
    }

    const rows = await db.sequelize.query(
      `
      SELECT
        i.*,
        ${eqTable ? "e.name AS equipmentName, e.code AS equipmentCode" : "NULL AS equipmentName, NULL AS equipmentCode"},
        ${gymTable ? "g.name AS gymName" : "NULL AS gymName"},
        ${userSelect}
      FROM \`${invTable}\` i
      ${joinEq}
      ${joinGym}
      ${joinUser}
      ${whereSql}
      ORDER BY i.\`${invCreatedAt}\` DESC
      LIMIT :limit OFFSET :offset
      `,
      { type: QueryTypes.SELECT, replacements: { ...params, limit, offset } }
    );

    const countRows = await db.sequelize.query(
      `SELECT COUNT(*) AS total FROM \`${invTable}\` i ${whereSql}`,
      { type: QueryTypes.SELECT, replacements: params }
    );

    const totalItems = Number(countRows?.[0]?.total || 0);
    return normalizeList(rows, totalItems, page, limit);
  },

  // ================== (4) IMPORT: Receipt + ReceiptItem + update stock + insert inventory ==================
  async createReceiptImport(payload, auditMeta = {}) {
    const gymId = payload.gymId ? Number(payload.gymId) : 1;
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) throw new Error("items is required");

    const receiptTable = tbl(db.Receipt);
    const receiptItemTable = tbl(db.ReceiptItem);
    const stockTable = tbl(db.EquipmentStock);
    const invTable = tbl(db.Inventory);

    // resolve columns (camel/snake)
    const rcReceiptNumber = (await pickCol(receiptTable, ["receiptNumber", "receipt_number"])) || "receiptNumber";
    const rcPurchaseOrderId = (await pickCol(receiptTable, ["purchaseOrderId", "purchase_order_id"])) || "purchaseOrderId";
    const rcGymId = (await pickCol(receiptTable, ["gymId", "gym_id"])) || "gymId";
    const rcReceiptDate = (await pickCol(receiptTable, ["receiptDate", "receipt_date"])) || "receiptDate";
    const rcStatus = (await pickCol(receiptTable, ["status"])) || "status";
    const rcTotalQuantity = (await pickCol(receiptTable, ["totalQuantity", "total_quantity"])) || "totalQuantity";
    const rcNotes = (await pickCol(receiptTable, ["notes"])) || "notes";
    const rcReceivedBy = (await pickCol(receiptTable, ["receivedBy", "received_by"])) || "receivedBy";

    const riReceiptId = (await pickCol(receiptItemTable, ["receiptId", "receipt_id"])) || "receiptId";
    const riEquipmentId = (await pickCol(receiptItemTable, ["equipmentId", "equipment_id"])) || "equipmentId";
    const riOrderedQuantity = (await pickCol(receiptItemTable, ["orderedQuantity", "ordered_quantity"])) || "orderedQuantity";
    const riReceivedQuantity = (await pickCol(receiptItemTable, ["receivedQuantity", "received_quantity"])) || "receivedQuantity";
    const riUnitPrice = (await pickCol(receiptItemTable, ["unitPrice", "unit_price"])) || "unitPrice";
    const riTotalPrice = (await pickCol(receiptItemTable, ["totalPrice", "total_price"])) || "totalPrice";
    const riNotes = (await pickCol(receiptItemTable, ["notes"])) || "notes";

    const stGymId = (await pickCol(stockTable, ["gymId", "gym_id"])) || "gymId";
    const stEquipmentId = (await pickCol(stockTable, ["equipmentId", "equipment_id"])) || "equipmentId";
    const stQty = (await pickCol(stockTable, ["quantity"])) || "quantity";
    const stAvail = (await pickCol(stockTable, ["availableQuantity", "available_quantity"])) || "availableQuantity";
    const stLastRestocked = (await pickCol(stockTable, ["lastRestocked", "last_restocked"])) || null;

    const invGymId = (await pickCol(invTable, ["gymId", "gym_id"])) || "gymId";
    const invEquipmentId = (await pickCol(invTable, ["equipmentId", "equipment_id"])) || "equipmentId";
    const invAction = (await pickCol(invTable, ["action"])) || "action";
    const invQuantity = (await pickCol(invTable, ["quantity"])) || "quantity";
    const invBefore = (await pickCol(invTable, ["stockBefore", "stock_before"])) || "stockBefore";
    const invAfter = (await pickCol(invTable, ["stockAfter", "stock_after"])) || "stockAfter";
    const invRefType = (await pickCol(invTable, ["referenceType", "reference_type"])) || "referenceType";
    const invRefId = (await pickCol(invTable, ["referenceId", "reference_id"])) || "referenceId";
    const invPO = (await pickCol(invTable, ["purchaseOrderId", "purchase_order_id"])) || "purchaseOrderId";
    const invReason = (await pickCol(invTable, ["reason"])) || "reason";
    const invNotes = (await pickCol(invTable, ["notes"])) || "notes";
    const invCreatedBy = (await pickCol(invTable, ["createdBy", "created_by"])) || null;
    const invCostPerUnit = (await pickCol(invTable, ["costPerUnit", "cost_per_unit"])) || null;
    const invTotalCost = (await pickCol(invTable, ["totalCost", "total_cost"])) || null;

    return db.sequelize.transaction(async (t) => {
      const receiptNumber = payload.receiptNumber || `RC-${Date.now()}`;
      const totalQty = items.reduce((s, it) => s + Number(it.receivedQuantity || 0), 0);

      // INSERT receipt (raw)
      const insertReceiptSql = `
        INSERT INTO \`${receiptTable}\`
        (\`${rcReceiptNumber}\`, \`${rcPurchaseOrderId}\`, \`${rcGymId}\`, \`${rcReceiptDate}\`, \`${rcStatus}\`, \`${rcTotalQuantity}\`, \`${rcNotes}\`, \`${rcReceivedBy}\`, createdAt, updatedAt)
        VALUES
        (:receiptNumber, :purchaseOrderId, :gymId, :receiptDate, :status, :totalQuantity, :notes, :receivedBy, NOW(), NOW())
      `;
      const [_, metaReceipt] = await db.sequelize.query(insertReceiptSql, {
        type: QueryTypes.INSERT,
        transaction: t,
        replacements: {
          receiptNumber,
          purchaseOrderId: payload.purchaseOrderId ?? null,
          gymId,
          receiptDate: payload.receiptDate ? new Date(payload.receiptDate) : new Date(),
          status: "received",
          totalQuantity: totalQty,
          notes: payload.notes || null,
          receivedBy: auditMeta.actorUserId || null,
        },
      });

      const receiptId = metaReceipt?.insertId;

      // for each item: insert ReceiptItem + upsert stock + insert inventory log
      for (const it of items) {
        const equipmentId = Number(it.equipmentId);
        const receivedQuantity = Number(it.receivedQuantity || 0);
        if (!equipmentId || receivedQuantity <= 0) throw new Error("Invalid receipt item");

        const unitPrice = it.unitPrice === null || it.unitPrice === undefined ? null : Number(it.unitPrice);
        const totalPrice = unitPrice === null ? null : unitPrice * receivedQuantity;

        // insert ReceiptItem
        const insertItemSql = `
          INSERT INTO \`${receiptItemTable}\`
          (\`${riReceiptId}\`, \`${riEquipmentId}\`, \`${riOrderedQuantity}\`, \`${riReceivedQuantity}\`, \`${riUnitPrice}\`, \`${riTotalPrice}\`, \`${riNotes}\`, createdAt, updatedAt)
          VALUES
          (:receiptId, :equipmentId, :orderedQuantity, :receivedQuantity, :unitPrice, :totalPrice, :notes, NOW(), NOW())
        `;
        await db.sequelize.query(insertItemSql, {
          type: QueryTypes.INSERT,
          transaction: t,
          replacements: {
            receiptId,
            equipmentId,
            orderedQuantity: it.orderedQuantity ?? receivedQuantity,
            receivedQuantity,
            unitPrice,
            totalPrice,
            notes: it.notes || null,
          },
        });

        // select stock FOR UPDATE
        const stockRows = await db.sequelize.query(
          `SELECT * FROM \`${stockTable}\` WHERE \`${stGymId}\` = :gymId AND \`${stEquipmentId}\` = :equipmentId LIMIT 1 FOR UPDATE`,
          { type: QueryTypes.SELECT, transaction: t, replacements: { gymId, equipmentId } }
        );
        let stock = stockRows?.[0];

        if (!stock) {
          // create stock row if missing
          const insertStockSql = `
            INSERT INTO \`${stockTable}\`
            (\`${stGymId}\`, \`${stEquipmentId}\`, \`${stQty}\`, \`${stAvail}\`, createdAt, updatedAt)
            VALUES (:gymId, :equipmentId, 0, 0, NOW(), NOW())
          `;
          await db.sequelize.query(insertStockSql, {
            type: QueryTypes.INSERT,
            transaction: t,
            replacements: { gymId, equipmentId },
          });

          const stockRows2 = await db.sequelize.query(
            `SELECT * FROM \`${stockTable}\` WHERE \`${stGymId}\` = :gymId AND \`${stEquipmentId}\` = :equipmentId LIMIT 1 FOR UPDATE`,
            { type: QueryTypes.SELECT, transaction: t, replacements: { gymId, equipmentId } }
          );
          stock = stockRows2?.[0];
        }

        const before = Number(stock?.[stAvail] ?? stock?.availableQuantity ?? stock?.available_quantity ?? 0);
        const qtyBefore = Number(stock?.[stQty] ?? stock?.quantity ?? 0);

        // update stock
        const updateParts = [
          `\`${stAvail}\` = :newAvail`,
          `\`${stQty}\` = :newQty`,
          `updatedAt = NOW()`,
        ];
        const replacements = {
          gymId,
          equipmentId,
          newAvail: before + receivedQuantity,
          newQty: qtyBefore + receivedQuantity,
        };
        if (stLastRestocked) {
          updateParts.push(`\`${stLastRestocked}\` = NOW()`);
        }

        await db.sequelize.query(
          `UPDATE \`${stockTable}\` SET ${updateParts.join(", ")} WHERE \`${stGymId}\` = :gymId AND \`${stEquipmentId}\` = :equipmentId`,
          { type: QueryTypes.UPDATE, transaction: t, replacements }
        );

        // insert inventory log
        const invCols = [
          `\`${invEquipmentId}\``,
          `\`${invGymId}\``,
          `\`${invAction}\``,
          `\`${invQuantity}\``,
          `\`${invBefore}\``,
          `\`${invAfter}\``,
          `\`${invRefType}\``,
          `\`${invRefId}\``,
          `\`${invPO}\``,
          `\`${invReason}\``,
          `\`${invNotes}\``,
        ];
        const invVals = [
          ":equipmentId",
          ":gymId",
          ":action",
          ":quantity",
          ":stockBefore",
          ":stockAfter",
          ":referenceType",
          ":referenceId",
          ":purchaseOrderId",
          ":reason",
          ":notes",
        ];
        const invRep = {
          equipmentId,
          gymId,
          action: "import",
          quantity: receivedQuantity,
          stockBefore: before,
          stockAfter: before + receivedQuantity,
          referenceType: "purchase_order",
          referenceId: receiptId,
          purchaseOrderId: payload.purchaseOrderId ?? null,
          reason: "purchase",
          notes: payload.notes || null,
        };

        if (invCreatedBy) {
          invCols.push(`\`${invCreatedBy}\``);
          invVals.push(":createdBy");
          invRep.createdBy = auditMeta.actorUserId || null;
        }
        if (invCostPerUnit) {
          invCols.push(`\`${invCostPerUnit}\``);
          invVals.push(":costPerUnit");
          invRep.costPerUnit = unitPrice;
        }
        if (invTotalCost) {
          invCols.push(`\`${invTotalCost}\``);
          invVals.push(":totalCost");
          invRep.totalCost = totalPrice;
        }

        await db.sequelize.query(
          `INSERT INTO \`${invTable}\` (${invCols.join(", ")}, createdAt, updatedAt)
           VALUES (${invVals.join(", ")}, NOW(), NOW())`,
          { type: QueryTypes.INSERT, transaction: t, replacements: invRep }
        );
      }

      // return receipt row
      const after = await selectById(receiptTable, receiptId, t);
      return after;
    });
  },

  // ================== (5) EXPORT: update stock + insert inventory ==================
  async createExport(payload, auditMeta = {}) {
    const gymId = payload.gymId ? Number(payload.gymId) : 1;
    const equipmentId = Number(payload.equipmentId);
    const quantity = Number(payload.quantity || 0);
    if (!equipmentId || quantity <= 0) throw new Error("Invalid export payload");

    const stockTable = tbl(db.EquipmentStock);
    const invTable = tbl(db.Inventory);

    const stGymId = (await pickCol(stockTable, ["gymId", "gym_id"])) || "gymId";
    const stEquipmentId = (await pickCol(stockTable, ["equipmentId", "equipment_id"])) || "equipmentId";
    const stQty = (await pickCol(stockTable, ["quantity"])) || "quantity";
    const stAvail = (await pickCol(stockTable, ["availableQuantity", "available_quantity"])) || "availableQuantity";

    const invGymId = (await pickCol(invTable, ["gymId", "gym_id"])) || "gymId";
    const invEquipmentId = (await pickCol(invTable, ["equipmentId", "equipment_id"])) || "equipmentId";
    const invAction = (await pickCol(invTable, ["action"])) || "action";
    const invQuantity = (await pickCol(invTable, ["quantity"])) || "quantity";
    const invBefore = (await pickCol(invTable, ["stockBefore", "stock_before"])) || "stockBefore";
    const invAfter = (await pickCol(invTable, ["stockAfter", "stock_after"])) || "stockAfter";
    const invRefType = (await pickCol(invTable, ["referenceType", "reference_type"])) || "referenceType";
    const invRefId = (await pickCol(invTable, ["referenceId", "reference_id"])) || "referenceId";
    const invReason = (await pickCol(invTable, ["reason"])) || "reason";
    const invNotes = (await pickCol(invTable, ["notes"])) || "notes";
    const invCreatedBy = (await pickCol(invTable, ["createdBy", "created_by"])) || null;

    return db.sequelize.transaction(async (t) => {
      const stockRows = await db.sequelize.query(
        `SELECT * FROM \`${stockTable}\` WHERE \`${stGymId}\` = :gymId AND \`${stEquipmentId}\` = :equipmentId LIMIT 1 FOR UPDATE`,
        { type: QueryTypes.SELECT, transaction: t, replacements: { gymId, equipmentId } }
      );
      const stock = stockRows?.[0];
      if (!stock) throw new Error("Stock not found");

      const before = Number(stock?.[stAvail] ?? stock?.availableQuantity ?? stock?.available_quantity ?? 0);
      const qtyBefore = Number(stock?.[stQty] ?? stock?.quantity ?? 0);
      if (before < quantity) throw new Error("Not enough availableQuantity");

      const newAvail = before - quantity;
      const newQty = Math.max(0, qtyBefore - quantity);

      await db.sequelize.query(
        `UPDATE \`${stockTable}\`
         SET \`${stAvail}\` = :newAvail, \`${stQty}\` = :newQty, updatedAt = NOW()
         WHERE \`${stGymId}\` = :gymId AND \`${stEquipmentId}\` = :equipmentId`,
        { type: QueryTypes.UPDATE, transaction: t, replacements: { gymId, equipmentId, newAvail, newQty } }
      );

      const invCols = [
        `\`${invEquipmentId}\``,
        `\`${invGymId}\``,
        `\`${invAction}\``,
        `\`${invQuantity}\``,
        `\`${invBefore}\``,
        `\`${invAfter}\``,
        `\`${invRefType}\``,
        `\`${invRefId}\``,
        `\`${invReason}\``,
        `\`${invNotes}\``,
      ];
      const invVals = [
        ":equipmentId",
        ":gymId",
        ":action",
        ":quantity",
        ":stockBefore",
        ":stockAfter",
        ":referenceType",
        ":referenceId",
        ":reason",
        ":notes",
      ];
      const invRep = {
        equipmentId,
        gymId,
        action: "export",
        quantity,
        stockBefore: before,
        stockAfter: newAvail,
        referenceType: "adjustment",
        referenceId: null,
        reason: payload.reason || "other",
        notes: payload.notes || null,
      };

      if (invCreatedBy) {
        invCols.push(`\`${invCreatedBy}\``);
        invVals.push(":createdBy");
        invRep.createdBy = auditMeta.actorUserId || null;
      }

      await db.sequelize.query(
        `INSERT INTO \`${invTable}\` (${invCols.join(", ")}, createdAt, updatedAt)
         VALUES (${invVals.join(", ")}, NOW(), NOW())`,
        { type: QueryTypes.INSERT, transaction: t, replacements: invRep }
      );

      return { ok: true, gymId, equipmentId, before, after: newAvail };
    });
  },
};

export default adminInventoryService;
