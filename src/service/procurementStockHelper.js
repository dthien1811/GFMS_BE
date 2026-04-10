const { Op } = require("sequelize");
const db = require("../models");
const { ADMIN_STOCK_GYM_NAME } = require("../constants/adminStockGym");
const { EquipmentStock, Equipment, PurchaseOrder, PurchaseOrderItem, Gym, sequelize } = db;

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

async function getCentralGymIds(transaction) {
  const rows = await Gym.findAll({
    where: {
      [Op.or]: [{ ownerId: null }, { name: ADMIN_STOCK_GYM_NAME }],
    },
    attributes: ["id"],
    raw: true,
    transaction,
  });
  return (rows || []).map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0);
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

  // availableQuantity / quantityOnHand = tồn tại KHO TRUNG TÂM (admin), không phải tồn gym owner.
  // Owner chỉ có tồn sau khi nhận hàng; dùng để tính có đủ bán từ admin hay không.
  // Nếu chưa có gym trung tâm: fallback cộng tồn các gym khác gym trong yêu cầu (môi trường demo).
  const centralGymIds = await getCentralGymIds(transaction);
  let quantity = 0;
  let availableQuantity = 0;

  if (centralGymIds.length) {
    const centralStocks = await EquipmentStock.findAll({
      where: { equipmentId: Number(equipmentId), gymId: { [Op.in]: centralGymIds } },
      attributes: ["quantity", "availableQuantity"],
      raw: true,
      transaction,
    });
    quantity = (centralStocks || []).reduce((sum, s) => sum + Number(s.quantity || 0), 0);
    availableQuantity = (centralStocks || []).reduce(
      (sum, s) => sum + Number(s.availableQuantity ?? s.quantity ?? 0),
      0
    );
  } else {
    // Fallback mode: no explicit central gym configured.
    // Use all other gyms EXCEPT the requesting gym to avoid self-deduct/self-add no-op.
    const fallbackStocks = await EquipmentStock.findAll({
      where: {
        equipmentId: Number(equipmentId),
        gymId: { [Op.ne]: Number(gymId) },
      },
      attributes: ["quantity", "availableQuantity"],
      raw: true,
      transaction,
    });
    quantity = (fallbackStocks || []).reduce((sum, s) => sum + Number(s.quantity || 0), 0);
    availableQuantity = (fallbackStocks || []).reduce(
      (sum, s) => sum + Number(s.availableQuantity ?? s.quantity ?? 0),
      0
    );
  }
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
 * Chọn dòng tồn để TRỪ khi bán/xuất cho owner qua PurchaseRequest.
 * Nghiệp vụ chuẩn: trừ kho trung tâm (admin); gym nhận (owner) chỉ là fallback khi dữ liệu cũ sai.
 *
 * @param {Array<{ gymId: number, availableQuantity?: number }>} stocks
 * @param {{ gymId: number }} pr
 * @param {Set<number>} centralGymIdSet
 * @returns {{ sourceStocks: typeof stocks, noteSuffix: string }}
 */
function selectSourceStocksForPurchaseRequestSale(stocks, pr, centralGymIdSet) {
  const recipientGymId = Number(pr.gymId);
  const list = Array.isArray(stocks) ? stocks : [];
  const centralStocks = list.filter((s) => centralGymIdSet.has(Number(s.gymId)));
  const nonOwnerStocks = list.filter((s) => Number(s.gymId) !== recipientGymId);
  let sourceStocks = centralStocks.length ? centralStocks : nonOwnerStocks;
  let noteSuffix = "";

  if (!sourceStocks.length && centralGymIdSet.size === 0 && list.length) {
    sourceStocks = list;
    noteSuffix = " [nguồn: toàn bộ kho — hệ thống chưa có gym trung tâm]";
  }

  if (!sourceStocks.length && list.length) {
    const ownerGymWithAvail = list.filter(
      (s) =>
        Number(s.gymId) === recipientGymId && Number(s.availableQuantity || 0) > 0
    );
    if (ownerGymWithAvail.length) {
      sourceStocks = ownerGymWithAvail;
      noteSuffix =
        " [nguồn: kho gym nhận — nên chuyển tồn về kho trung tâm cho đúng quy trình]";
    }
  }

  return { sourceStocks, noteSuffix };
}

/** Rule đồ án: lý do mở rộng / thay thế / bảo trì… luôn hợp lệ; low_stock chỉ khi tồn kho trung tâm (ctx) dưới ngưỡng. */
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
  getCentralGymIds,
  buildStockContext,
  computeFulfillmentPlan,
  computeStockStatus,
  validateRequestReason,
  selectSourceStocksForPurchaseRequestSale,
};
