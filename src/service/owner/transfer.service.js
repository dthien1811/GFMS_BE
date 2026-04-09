import db from "../../models";
import { Op } from "sequelize";
import realtimeService from "../realtime.service";
import equipmentUnitEventUtils from "../../utils/equipmentUnitEvent";

const { EquipmentTransfer, EquipmentTransferItem, Equipment, Gym, sequelize } = db;
const { logEquipmentUnitEvents } = equipmentUnitEventUtils;

const parsePaging = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const ensure = (condition, message, statusCode = 400) => {
  if (!condition) throw { message, statusCode };
};

const emitTransferChanged = (userIds = [], payload = {}) => {
  [...new Set((userIds || []).filter(Boolean).map(Number))].forEach((userId) => {
    realtimeService.emitUser(userId, "transfer:changed", payload);
  });
};

const notifyTransferUsers = async (userIds = [], payload = {}) => {
  const ids = [...new Set((userIds || []).filter(Boolean).map(Number))];
  if (!ids.length) return;
  await realtimeService.notifyUsers(ids, {
    notificationType: "transfer",
    relatedType: "transfer",
    ...payload,
  });
};

const parseSelectedUnitIds = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];
  } catch {
    return [];
  }
};

const createTransferInventoryLog = async ({
  transaction,
  gymId,
  equipmentId,
  transactionType,
  transferId,
  transactionCode,
  quantity,
  stockBefore,
  stockAfter,
  recordedBy,
  notes,
}) => {
  await db.Inventory.create(
    {
      gymId,
      equipmentId,
      transactionType,
      transactionId: transferId,
      transactionCode,
      quantity,
      unitPrice: null,
      totalValue: null,
      stockBefore,
      stockAfter,
      notes,
      recordedBy,
      recordedAt: new Date(),
    },
    { transaction }
  );
};

const reserveTransferItems = async ({ transfer, items, ownerUserId, transaction }) => {
  const { EquipmentStock, EquipmentUnit } = db;

  for (const item of items || []) {
    ensure(Number(item.quantity || 0) > 0, `Số lượng chuyển không hợp lệ cho thiết bị ${item.equipmentId}`, 400);

    const stock = await EquipmentStock.findOne({
      where: {
        gymId: transfer.fromGymId,
        equipmentId: item.equipmentId,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    ensure(stock, `Stock not found for equipment ${item.equipmentId}`, 404);
    ensure(
      Number(stock.availableQuantity || 0) >= Number(item.quantity || 0),
      `Không đủ số lượng khả dụng để duyệt chuyển kho cho thiết bị ${item.equipmentId}`,
      400
    );

    const selectedUnitIds = parseSelectedUnitIds(item.selectedUnitIds);
    const units = await EquipmentUnit.findAll({
      where: selectedUnitIds.length > 0
        ? {
            id: { [Op.in]: selectedUnitIds },
            gymId: transfer.fromGymId,
            equipmentId: item.equipmentId,
            status: "active",
            usageStatus: "in_stock",
            transferId: null,
          }
        : {
            gymId: transfer.fromGymId,
            equipmentId: item.equipmentId,
            status: "active",
            usageStatus: "in_stock",
            transferId: null,
          },
      order: [["id", "ASC"]],
      limit: Number(item.quantity || 0),
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    ensure(
      units.length >= Number(item.quantity || 0),
      `Không tìm thấy đủ đơn vị thiết bị để duyệt chuyển kho cho thiết bị ${item.equipmentId}`,
      400
    );

    await EquipmentUnit.update(
      {
        status: "transfer_pending",
        transferId: transfer.id,
      },
      {
        where: { id: { [Op.in]: units.map((unit) => unit.id) } },
        transaction,
      }
    );

    await logEquipmentUnitEvents(
      units.map((unit) => ({
        equipmentUnitId: unit.id,
        equipmentId: item.equipmentId,
        gymId: transfer.fromGymId,
        fromGymId: transfer.fromGymId,
        toGymId: transfer.toGymId,
        eventType: "transfer_reserved",
        referenceType: "equipment_transfer",
        referenceId: transfer.id,
        performedBy: ownerUserId,
        notes: `Giữ chỗ chuyển kho qua ${transfer.code}`,
        metadata: {
          transferCode: transfer.code,
          transferItemId: item.id || null,
        },
      })),
      { transaction }
    );

    await stock.update(
      {
        availableQuantity: Math.max(0, Number(stock.availableQuantity || 0) - Number(item.quantity || 0)),
        reservedQuantity: Number(stock.reservedQuantity || 0) + Number(item.quantity || 0),
      },
      { transaction }
    );
  }
};

const ownerTransferService = {
  // Get transfers for owner's gyms (from or to)
  async getTransfers(ownerUserId, query) {
    const { page, limit, offset } = parsePaging(query);
    const { status, q } = query;

    // Get owner's gyms
    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => g.id);

    if (gymIds.length === 0) {
      return { data: [], meta: { page, limit, totalItems: 0, totalPages: 0 } };
    }

    // Transfer from or to owner's gyms
    const where = {
      [Op.or]: [
        { fromGymId: { [Op.in]: gymIds } },
        { toGymId: { [Op.in]: gymIds } },
      ],
    };

    if (status) {
      where.status = status;
    }

    if (q) {
      where[Op.or] = [
        { notes: { [Op.like]: `%${q}%` } },
        { "$fromGym.name$": { [Op.like]: `%${q}%` } },
        { "$toGym.name$": { [Op.like]: `%${q}%` } },
      ];
    }

    const { rows, count } = await EquipmentTransfer.findAndCountAll({
      where,
      include: [
        { model: Gym, as: "fromGym", required: false, attributes: ["id", "name", "ownerId"] },
        { model: Gym, as: "toGym", required: false, attributes: ["id", "name", "ownerId"] },
        {
          model: EquipmentTransferItem,
          as: "items",
          required: false,
          attributes: ["id", "transferId", "equipmentId", "quantity"],
          include: [{ model: Equipment, as: "equipment", attributes: ["id", "name", "code"] }],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    // Filter to ensure both gyms belong to owner
    const filtered = rows.filter(
      (t) =>
        (t.fromGym && t.fromGym.ownerId === ownerUserId) ||
        (t.toGym && t.toGym.ownerId === ownerUserId)
    );

    return {
      data: filtered,
      meta: {
        page,
        limit,
        totalItems: filtered.length,
        totalPages: Math.ceil(filtered.length / limit),
      },
    };
  },

  // Get transfer detail
  async getTransferDetail(ownerUserId, transferId) {
    const transfer = await EquipmentTransfer.findByPk(transferId, {
      include: [
        { model: Gym, as: "fromGym", attributes: ["id", "name", "ownerId"] },
        { model: Gym, as: "toGym", attributes: ["id", "name", "ownerId"] },
        {
          model: EquipmentTransferItem,
          as: "items",
          attributes: ["id", "transferId", "equipmentId", "quantity", "selectedUnitIds"],
          include: [{ model: Equipment, as: "equipment", attributes: ["id", "name", "code"] }],
        },
      ],
    });

    ensure(transfer, "Transfer not found", 404);

    // Check if both gyms belong to owner
    const fromOwnerMatch = transfer.fromGym && transfer.fromGym.ownerId === ownerUserId;
    const toOwnerMatch = transfer.toGym && transfer.toGym.ownerId === ownerUserId;

    ensure(
      fromOwnerMatch && toOwnerMatch,
      "Not authorized to view this transfer",
      403
    );

    const requestedUnitIds = [
      ...new Set(
        (transfer.items || [])
          .flatMap((item) => parseSelectedUnitIds(item.selectedUnitIds))
          .filter(Boolean)
      ),
    ];

    if (requestedUnitIds.length > 0) {
      const units = await db.EquipmentUnit.findAll({
        where: { id: { [Op.in]: requestedUnitIds } },
        attributes: ["id", "equipmentId", "assetCode", "status", "gymId"],
      });
      const unitsById = new Map(units.map((unit) => [Number(unit.id), unit]));
      transfer.items.forEach((item) => {
        const itemUnitIds = parseSelectedUnitIds(item.selectedUnitIds);
        item.setDataValue(
          "selectedUnits",
          itemUnitIds.map((id) => unitsById.get(Number(id))).filter(Boolean)
        );
      });
    }

    return transfer;
  },

  // Create transfer request
  async createTransfer(ownerUserId, payload) {
    try {
      const { fromGymId, toGymId, items, notes } = payload;

      ensure(fromGymId, "fromGymId is required");
      ensure(toGymId, "toGymId is required");
      ensure(items && Array.isArray(items) && items.length > 0, "items must be non-empty array");

      // Check both gyms belong to owner
      const [fromGym, toGym] = await Promise.all([
        Gym.findByPk(Number(fromGymId)),
        Gym.findByPk(Number(toGymId)),
      ]);

      ensure(fromGym && fromGym.ownerId === ownerUserId, "fromGym not found or not authorized", 403);
      ensure(toGym && toGym.ownerId === ownerUserId, "toGym not found or not authorized", 403);
      ensure(fromGymId !== toGymId, "From and To gym must be different");

      // Validate stock availability for all items
      const { EquipmentStock, EquipmentUnit } = db;
      const selectedUnitIdsAcrossItems = new Set();
      for (const item of items) {
        const selectedUnitIds = parseSelectedUnitIds(item.selectedUnitIds);
        const requestedQty = selectedUnitIds.length || Number(item.quantity);
        const stock = await EquipmentStock.findOne({
          attributes: ["id", "quantity", "availableQuantity", "reservedQuantity"],
          where: {
            gymId: Number(fromGymId),
            equipmentId: Number(item.equipmentId),
          },
        });

        ensure(
          stock && stock.availableQuantity >= requestedQty,
          `Equipment ${item.equipmentId} không có đủ số lượng trong kho (yêu cầu: ${requestedQty}, có: ${stock?.availableQuantity || 0})`,
          400
        );

        if (selectedUnitIds.length > 0) {
          selectedUnitIds.forEach((id) => {
            ensure(!selectedUnitIdsAcrossItems.has(id), `Thiết bị đơn vị #${id} bị chọn trùng`, 400);
            selectedUnitIdsAcrossItems.add(id);
          });

          const units = await EquipmentUnit.findAll({
            where: {
              id: { [Op.in]: selectedUnitIds },
              gymId: Number(fromGymId),
              equipmentId: Number(item.equipmentId),
              status: "active",
              usageStatus: "in_stock",
              transferId: null,
            },
            attributes: ["id"],
          });

          ensure(
            units.length === selectedUnitIds.length,
            `Có đơn vị thiết bị không còn khả dụng cho equipment ${item.equipmentId}`,
            400
          );
        }
      }

      return sequelize.transaction(async (t) => {
        // Generate transfer code
        const count = await EquipmentTransfer.count();
        const code = `TRANSFER-${Date.now()}-${count + 1}`;

        const transfer = await EquipmentTransfer.create(
          {
            code,
            transferDate: new Date(),
            fromGymId: Number(fromGymId),
            toGymId: Number(toGymId),
            status: "approved",
            notes: notes || "",
          },
          { transaction: t }
        );

        // Create transfer items
        const transferItems = items.map((item) => ({
          transferId: transfer.id,
          equipmentId: Number(item.equipmentId),
          quantity: parseSelectedUnitIds(item.selectedUnitIds).length || Number(item.quantity),
          selectedUnitIds: parseSelectedUnitIds(item.selectedUnitIds).length
            ? JSON.stringify(parseSelectedUnitIds(item.selectedUnitIds))
            : null,
        }));

        await EquipmentTransferItem.bulkCreate(transferItems, { transaction: t });

        const createdItems = await EquipmentTransferItem.findAll({
          where: { transferId: transfer.id },
          attributes: ["id", "equipmentId", "quantity", "selectedUnitIds"],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        await reserveTransferItems({
          transfer,
          items: createdItems,
          ownerUserId,
          transaction: t,
        });

        emitTransferChanged([ownerUserId], {
          transferId: transfer.id,
          status: transfer.status,
          action: "created",
        });

        await notifyTransferUsers([ownerUserId], {
          title: "Có phiếu chuyển kho mới",
          message: `Phiếu ${transfer.code} đã được tạo từ gym #${transfer.fromGymId} sang gym #${transfer.toGymId}.`,
          relatedId: transfer.id,
        });

        return transfer;
      });
    } catch (error) {
      console.error("createTransfer error:", error);
      throw error;
    }
  },

  // Approve transfer
  async approveTransfer(ownerUserId, transferId) {
    const transfer = await EquipmentTransfer.findByPk(transferId, {
      include: [{ model: EquipmentTransferItem, as: "items", attributes: ["id", "equipmentId", "quantity", "selectedUnitIds"] }],
    });

    ensure(transfer, "Transfer not found", 404);

    // Check authorization
    const fromGym = await Gym.findByPk(transfer.fromGymId);
    ensure(fromGym && fromGym.ownerId === ownerUserId, "Not authorized", 403);

    ensure(
      transfer.status === "pending",
      "Only pending transfers can be approved"
    );

    return sequelize.transaction(async (t) => {
      await reserveTransferItems({
        transfer,
        items: transfer.items || [],
        ownerUserId,
        transaction: t,
      });

      await transfer.update({ status: "approved" }, { transaction: t });
      emitTransferChanged([ownerUserId], {
        transferId: transfer.id,
        status: "approved",
        action: "approved",
      });
      await notifyTransferUsers([ownerUserId], {
        title: "Phiếu chuyển kho đã được duyệt",
        message: `Phiếu ${transfer.code} đã được duyệt và đang chờ chi nhánh nhận xác nhận.`,
        relatedId: transfer.id,
      });
      return transfer;
    });
  },

  // Reject transfer
  async rejectTransfer(ownerUserId, transferId, reason, actingGymId) {
    const transfer = await EquipmentTransfer.findByPk(transferId);

    ensure(transfer, "Transfer not found", 404);

    const fromGym = await Gym.findByPk(transfer.fromGymId);
    const toGym = await Gym.findByPk(transfer.toGymId);
    const normalizedActingGymId = Number(actingGymId);

    ensure(
      (fromGym && fromGym.ownerId === ownerUserId) || (toGym && toGym.ownerId === ownerUserId),
      "Not authorized",
      403
    );

    ensure(["pending", "approved"].includes(transfer.status), "Only pending/approved transfers can be rejected");

    if (transfer.status === "approved") {
      ensure(
        Number.isInteger(normalizedActingGymId) && normalizedActingGymId > 0,
        "Vui lòng chọn chi nhánh đang xử lý phiếu trước khi từ chối",
        400
      );
      ensure(
        [Number(transfer.fromGymId), Number(transfer.toGymId)].includes(normalizedActingGymId),
        "Chỉ chi nhánh gửi hoặc chi nhánh nhận mới được từ chối phiếu chuyển này",
        403
      );
    }

    return sequelize.transaction(async (t) => {
      if (transfer.status === "approved") {
        const { EquipmentStock, EquipmentUnit } = db;
        const items = await EquipmentTransferItem.findAll({
          where: { transferId: transfer.id },
          attributes: ["id", "equipmentId", "quantity"],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        for (const item of items) {
          const affectedUnits = await EquipmentUnit.findAll({
            where: {
              transferId: transfer.id,
              equipmentId: item.equipmentId,
            },
            attributes: ["id", "equipmentId", "gymId"],
            transaction: t,
            lock: t.LOCK.UPDATE,
          });

          await EquipmentUnit.update(
            {
              status: "active",
              usageStatus: "in_stock",
              transferId: null,
            },
            {
              where: {
                transferId: transfer.id,
                equipmentId: item.equipmentId,
              },
              transaction: t,
            }
          );

          await logEquipmentUnitEvents(
            affectedUnits.map((unit) => ({
              equipmentUnitId: unit.id,
              equipmentId: unit.equipmentId,
              gymId: transfer.fromGymId,
              fromGymId: transfer.fromGymId,
              toGymId: transfer.toGymId,
              eventType: "transfer_released",
              referenceType: "equipment_transfer",
              referenceId: transfer.id,
              performedBy: ownerUserId,
              notes: `Huỷ giữ chỗ chuyển kho ${transfer.code}`,
              metadata: {
                transferCode: transfer.code,
                transferItemId: item.id,
                reason: reason || null,
              },
            })),
            { transaction: t }
          );

          const stock = await EquipmentStock.findOne({
            where: { gymId: transfer.fromGymId, equipmentId: item.equipmentId },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });

          if (stock) {
            await stock.update(
              {
                availableQuantity: Number(stock.availableQuantity || 0) + Number(item.quantity || 0),
                reservedQuantity: Math.max(0, Number(stock.reservedQuantity || 0) - Number(item.quantity || 0)),
              },
              { transaction: t }
            );
          }
        }
      }

      await transfer.update(
        { status: "rejected", notes: reason || "" },
        { transaction: t }
      );
      emitTransferChanged([ownerUserId], {
        transferId: transfer.id,
        status: "rejected",
        action: "rejected",
      });
      await notifyTransferUsers([ownerUserId], {
        title: "Phiếu chuyển kho bị từ chối",
        message: reason || `Phiếu ${transfer.code} đã bị từ chối hoặc chi nhánh nhận từ chối nhận hàng.`,
        relatedId: transfer.id,
      });
      return transfer;
    });
  },

  // Complete transfer
  async completeTransfer(ownerUserId, transferId, actingGymId) {
    const transfer = await EquipmentTransfer.findByPk(transferId, {
      include: [
        { model: Gym, as: "toGym" },
        { model: Gym, as: "fromGym" },
        {
          model: EquipmentTransferItem,
          as: "items",
          attributes: ["id", "equipmentId", "quantity"],
        },
      ],
    });

    ensure(transfer, "Transfer not found", 404);

    const normalizedActingGymId = Number(actingGymId);
    ensure(
      Number.isInteger(normalizedActingGymId) && normalizedActingGymId > 0,
      "Vui lòng chọn chi nhánh nhận hàng trước khi xác nhận nhận hàng",
      400
    );

    // Owner must belong to destination gym and must currently act within that gym context.
    ensure(
      transfer.toGym && transfer.toGym.ownerId === ownerUserId,
      "Not authorized",
      403
    );
    ensure(
      normalizedActingGymId === Number(transfer.toGymId),
      "Chỉ chi nhánh nhận hàng mới được xác nhận nhận hàng cho phiếu chuyển này",
      403
    );

    ensure(
      transfer.status === "approved",
      "Only approved transfers can be completed"
    );

    return sequelize.transaction(async (t) => {
      // Update stock for each item
      const { EquipmentStock, EquipmentUnit } = db;
      for (const item of transfer.items) {
        const qty = Number(item.quantity || 0);

        const fromGymStock = await EquipmentStock.findOne({
          where: {
            gymId: transfer.fromGymId,
            equipmentId: item.equipmentId,
          },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        ensure(fromGymStock, `Stock not found for equipment ${item.equipmentId}`, 404);
        ensure(Number(fromGymStock.reservedQuantity || 0) >= qty, `Reserved quantity mismatch for equipment ${item.equipmentId}`, 400);

        const reservedUnits = await EquipmentUnit.findAll({
          where: {
            gymId: transfer.fromGymId,
            equipmentId: item.equipmentId,
            transferId: transfer.id,
            status: "transfer_pending",
          },
          order: [["id", "ASC"]],
          limit: qty,
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        ensure(reservedUnits.length >= qty, `Không tìm thấy đủ đơn vị thiết bị đã reserve cho transfer ${transfer.id}`, 400);

        const beforeFromAvailable = Number(fromGymStock.availableQuantity || 0);
        const beforeFromQuantity = Number(fromGymStock.quantity || 0);

        await fromGymStock.update(
          {
            quantity: Math.max(0, beforeFromQuantity - qty),
            reservedQuantity: Math.max(0, Number(fromGymStock.reservedQuantity || 0) - qty),
          },
          { transaction: t }
        );

        await EquipmentUnit.update(
          {
            gymId: transfer.toGymId,
            status: "active",
            usageStatus: "in_stock",
            transferId: null,
          },
          {
            where: { id: { [Op.in]: reservedUnits.map((unit) => unit.id) } },
            transaction: t,
          }
        );

        await logEquipmentUnitEvents(
          reservedUnits.map((unit) => ({
            equipmentUnitId: unit.id,
            equipmentId: item.equipmentId,
            gymId: transfer.toGymId,
            fromGymId: transfer.fromGymId,
            toGymId: transfer.toGymId,
            eventType: "transfer_completed",
            referenceType: "equipment_transfer",
            referenceId: transfer.id,
            performedBy: ownerUserId,
            notes: `Hoàn tất chuyển kho ${transfer.code}`,
            metadata: {
              transferCode: transfer.code,
              transferItemId: item.id,
            },
          })),
          { transaction: t }
        );

        // Increase to gym stock (or create if doesn't exist)
        const toGymStock = await EquipmentStock.findOne({
          attributes: ["id", "gymId", "equipmentId", "quantity", "availableQuantity", "reservedQuantity"],
          where: {
            gymId: transfer.toGymId,
            equipmentId: item.equipmentId,
          },
          transaction: t,
        });

        const beforeToAvailable = Number(toGymStock?.availableQuantity || 0);
        const beforeToQuantity = Number(toGymStock?.quantity || 0);

        if (toGymStock) {
          await toGymStock.update(
            {
              quantity: beforeToQuantity + qty,
              availableQuantity: beforeToAvailable + qty,
            },
            { transaction: t }
          );
        } else {
          // Create new stock record if doesn't exist
          await EquipmentStock.create(
            {
              gymId: transfer.toGymId,
              equipmentId: item.equipmentId,
              quantity: qty,
              availableQuantity: qty,
              reservedQuantity: 0,
            },
            { transaction: t }
          );
        }

        await createTransferInventoryLog({
          transaction: t,
          gymId: transfer.fromGymId,
          equipmentId: item.equipmentId,
          transactionType: "transfer_out",
          transferId: transfer.id,
          transactionCode: transfer.code,
          quantity: -qty,
          stockBefore: beforeFromAvailable,
          stockAfter: beforeFromAvailable,
          recordedBy: ownerUserId,
          notes: `Transfer out via ${transfer.code}`,
        });

        await createTransferInventoryLog({
          transaction: t,
          gymId: transfer.toGymId,
          equipmentId: item.equipmentId,
          transactionType: "transfer_in",
          transferId: transfer.id,
          transactionCode: transfer.code,
          quantity: qty,
          stockBefore: beforeToAvailable,
          stockAfter: beforeToAvailable + qty,
          recordedBy: ownerUserId,
          notes: `Transfer in via ${transfer.code}`,
        });
      }

      // Update transfer status
      await transfer.update({ status: "completed" }, { transaction: t });
      emitTransferChanged([ownerUserId], {
        transferId: transfer.id,
        status: "completed",
        action: "completed",
      });
      await notifyTransferUsers([ownerUserId], {
        title: "Phiếu chuyển kho đã hoàn tất",
        message: `Chi nhánh nhận đã xác nhận hàng cho phiếu ${transfer.code}.`,
        relatedId: transfer.id,
      });
      return transfer;
    });
  },
};

export default ownerTransferService;
