"use strict";

const { QueryTypes } = require("sequelize");
const db = require("../models");

const ADMIN_STOCK_GYM_NAME = "Kho tồn Admin (hệ thống)";

/**
 * Gym dùng để ghi tồn khi admin thêm/sửa thiết bị — khớp với adminInventoryService (trước đây).
 */
async function resolveAdminStockGym({ transaction } = {}) {
  let gym = await db.Gym.findOne({
    where: { ownerId: null },
    attributes: ["id"],
    order: [["id", "ASC"]],
    transaction,
  });
  if (gym?.id) return gym;

  const named = await db.sequelize.query(
    `SELECT id FROM \`gym\` WHERE LOWER(TRIM(name)) = LOWER(TRIM(:name)) ORDER BY id ASC LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { name: ADMIN_STOCK_GYM_NAME }, transaction }
  );
  if (named?.[0]?.id) return { id: named[0].id };

  gym = await db.Gym.findOne({
    attributes: ["id"],
    order: [["id", "ASC"]],
    transaction,
  });
  return gym;
}

/**
 * Tập gymId được coi là "kho admin" khi đếm tồn cho owner mua / trừ khi xuất bán:
 * gym resolve (nơi admin ghi tồn), mọi gym ownerId NULL, mọi gym đúng tên kho hệ thống.
 */
async function getAdminWarehouseGymIdSet({ transaction } = {}) {
  const ids = new Set();

  const resolved = await resolveAdminStockGym({ transaction });
  if (resolved?.id != null) {
    const id = Number(resolved.id);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }

  const centralRows = await db.Gym.findAll({
    where: { ownerId: null },
    attributes: ["id"],
    raw: true,
    transaction,
  });
  for (const g of centralRows || []) {
    const id = Number(g.id);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }

  const namedRows = await db.sequelize.query(
    `SELECT id FROM \`gym\` WHERE LOWER(TRIM(name)) = LOWER(TRIM(:name))`,
    { type: QueryTypes.SELECT, replacements: { name: ADMIN_STOCK_GYM_NAME }, transaction }
  );
  for (const r of namedRows || []) {
    const id = Number(r.id);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }

  return ids;
}

module.exports = {
  ADMIN_STOCK_GYM_NAME,
  resolveAdminStockGym,
  getAdminWarehouseGymIdSet,
};
