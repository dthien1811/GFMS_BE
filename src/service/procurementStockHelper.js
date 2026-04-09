const { Op } = require("sequelize");
const db = require("../models");
const { EquipmentStock, Equipment, PurchaseOrder, PurchaseOrderItem, sequelize } = db;

const EXPANSION_REASONS = new Set([
  "new_opening",
  "upgrade",
  "replacement",
  "maintenance_unfixable",
]);

const LOW_STOCK_REASON = "low_stock";

function isExpansionReason(reason) {
  return EXPANSION_REASONS.has(String(reason || "").trim());
}

/**
 * Số lượng còn trên các PO đang chạy (chưa huỷ / chưa hoàn tất / chưa nháp) chưa nhận đủ.
 */
async function getPendingOrderedQuantity(gymId, equipmentId, transaction) {
  const items = await PurchaseOrderItem.findAll({
    where: { equipmentId: Number(equipmentId) },
    include: [
      {
        model: PurchaseOrder,
        as: "purchaseOrder",
        required: true,
        where: {
          gymId: Number(gymId),
          status: { [Op.notIn]: ["cancelled", "completed", "draft"] },
        },
      },
    ],
    transaction,
  });

  let sum = 0;
  for (const it of items) {
    const q = Number(it.quantity || 0);
    const r = Number(it.receivedQuantity || 0);
    sum += Math.max(0, q - r);
  }
  return sum;
}

async function getGymEquipmentStockRow(gymId, equipmentId, transaction) {
  return EquipmentStock.findOne({
    where: { gymId: Number(gymId), equipmentId: Number(equipmentId) },
    transaction,
  });
}

/**
 * Snapshot phục vụ owner preview + lưu vào purchase request.
 */
function computeFulfillmentPlan(requestedQty, ctx) {
  const requested = Math.max(0, Number(requestedQty || 0));
  const available = Math.max(0, Number(ctx?.availableQuantity || 0));
  const issueQty = Math.min(requested, available);
  const purchaseQty = Math.max(requested - issueQty, 0);
  return {
    requestedQuantity: requested,
    availableQuantity: available,
    issueQty,
    purchaseQty,
    stockUsedQuantity: issueQty,
    purchaseQuantity: purchaseQty,
    canFulfillFromStock: purchaseQty === 0,
  };
}

function computeStockStatus(ctx) {
  const available = Math.max(0, Number(ctx?.availableQuantity || 0));
  const minStock = Math.max(0, Number(ctx?.minStockLevel || 0));
  if (available <= 0) return "out_of_stock";
  if (available <= minStock) return "low_stock";
  return "in_stock";
}

async function buildStockContext(gymId, equipmentId, transaction) {
  const equipment = await Equipment.findByPk(Number(equipmentId), {
    attributes: ["id", "name", "minStockLevel"],
    transaction,
  });
  if (!equipment) return null;

  const stockRow = await getGymEquipmentStockRow(gymId, equipmentId, transaction);
  const quantity = stockRow ? Number(stockRow.quantity || 0) : 0;
  const availableQuantity = stockRow ? Number(stockRow.availableQuantity ?? stockRow.quantity ?? 0) : 0;
  const minStock = Number(equipment.minStockLevel ?? 0);
  const pendingPurchaseQty = await getPendingOrderedQuantity(gymId, equipmentId, transaction);
  const shortageToMin = Math.max(minStock - availableQuantity, 0);

  const ctx = {
    equipmentId: Number(equipmentId),
    equipmentName: equipment.name,
    quantityOnHand: quantity,
    availableQuantity,
    minStockLevel: minStock,
    pendingPurchaseQty,
    shortageToMin,
    shouldReorder: availableQuantity <= minStock,
  };

  return {
    ...ctx,
    stockStatus: computeStockStatus(ctx),
  };
}

/**
 * Rule đồ án: lý do mở rộng / thay thế / bảo trì… luôn hợp lệ;
 * low_stock chỉ khi available <= min hoặc tồn dưới ngưỡng (đồng nghĩa cần bổ sung).
 */
function validateRequestReason(reason, ctx) {
  const r = String(reason || "").trim();
  if (!r) return { ok: false, message: "reason is required" };

  if (isExpansionReason(r)) {
    return { ok: true };
  }

  if (r === LOW_STOCK_REASON) {
    if (!ctx) return { ok: false, message: "Missing stock context" };
    const avail = Number(ctx.availableQuantity || 0);
    const minS = Number(ctx.minStockLevel || 0);
    if (avail <= minS) return { ok: true };
    return {
      ok: false,
      message: `Lý do "thiếu tồn" chỉ dùng khi tồn khả dụng (${avail}) <= mức tối thiểu (${minS}).`,
    };
  }

  return { ok: false, message: `reason không hợp lệ: ${r}` };
}

module.exports = {
  EXPANSION_REASONS,
  LOW_STOCK_REASON,
  isExpansionReason,
  getPendingOrderedQuantity,
  getGymEquipmentStockRow,
  buildStockContext,
  computeFulfillmentPlan,
  computeStockStatus,
  validateRequestReason,
};
