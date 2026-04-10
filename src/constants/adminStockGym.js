"use strict";

/** Tên gym nội bộ dùng làm kho tồn Admin (khớp với bản ghi do hệ thống tạo). */
const ADMIN_STOCK_GYM_NAME = "Kho tồn Admin (hệ thống)";

function isAdminStockGym(gym) {
  if (!gym) return false;
  if (gym.ownerId == null) return true;
  return String(gym.name || "") === ADMIN_STOCK_GYM_NAME;
}

module.exports = { ADMIN_STOCK_GYM_NAME, isAdminStockGym };
