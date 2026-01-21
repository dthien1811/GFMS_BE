import db from "../../models";
import { Op } from "sequelize";

const { EquipmentTransfer, EquipmentTransferItem, Equipment, Gym, sequelize } = db;

const parsePaging = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const ensure = (condition, message, statusCode = 400) => {
  if (!condition) throw { message, statusCode };
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
        { model: EquipmentTransferItem, as: "items", required: false },
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

    return transfer;
  },

  // Create transfer request
  async createTransfer(ownerUserId, payload) {
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
    const { EquipmentStock } = db;
    for (const item of items) {
      const stock = await EquipmentStock.findOne({
        where: {
          gymId: Number(fromGymId),
          equipmentId: Number(item.equipmentId),
        },
      });

      ensure(
        stock && stock.availableQuantity >= Number(item.quantity),
        `Equipment ${item.equipmentId} không có đủ số lượng trong kho (yêu cầu: ${item.quantity}, có: ${stock?.availableQuantity || 0})`,
        400
      );
    }

    return sequelize.transaction(async (t) => {
      const transfer = await EquipmentTransfer.create(
        {
          fromGymId: Number(fromGymId),
          toGymId: Number(toGymId),
          status: "pending",
          notes: notes || "",
        },
        { transaction: t }
      );

      // Create transfer items
      const transferItems = items.map((item) => ({
        transferId: transfer.id,
        equipmentId: Number(item.equipmentId),
        quantity: Number(item.quantity),
      }));

      await EquipmentTransferItem.bulkCreate(transferItems, { transaction: t });

      return transfer;
    });
  },

  // Approve transfer
  async approveTransfer(ownerUserId, transferId) {
    const transfer = await EquipmentTransfer.findByPk(transferId);

    ensure(transfer, "Transfer not found", 404);

    // Check authorization
    const fromGym = await Gym.findByPk(transfer.fromGymId);
    ensure(fromGym && fromGym.ownerId === ownerUserId, "Not authorized", 403);

    ensure(
      transfer.status === "pending",
      "Only pending transfers can be approved"
    );

    return sequelize.transaction(async (t) => {
      await transfer.update({ status: "approved" }, { transaction: t });
      return transfer;
    });
  },

  // Reject transfer
  async rejectTransfer(ownerUserId, transferId, reason) {
    const transfer = await EquipmentTransfer.findByPk(transferId);

    ensure(transfer, "Transfer not found", 404);

    // Check authorization
    const fromGym = await Gym.findByPk(transfer.fromGymId);
    ensure(fromGym && fromGym.ownerId === ownerUserId, "Not authorized", 403);

    ensure(
      transfer.status === "pending",
      "Only pending transfers can be rejected"
    );

    return sequelize.transaction(async (t) => {
      await transfer.update(
        { status: "rejected", notes: reason || "" },
        { transaction: t }
      );
      return transfer;
    });
  },

  // Complete transfer
  async completeTransfer(ownerUserId, transferId) {
    const transfer = await EquipmentTransfer.findByPk(transferId, {
      include: [
        { model: Gym, as: "toGym" },
      ],
    });

    ensure(transfer, "Transfer not found", 404);

    // Check authorization - to gym owner can complete
    ensure(
      transfer.toGym && transfer.toGym.ownerId === ownerUserId,
      "Not authorized",
      403
    );

    ensure(
      transfer.status === "approved",
      "Only approved transfers can be completed"
    );

    return sequelize.transaction(async (t) => {
      await transfer.update({ status: "completed" }, { transaction: t });
      return transfer;
    });
  },
};

export default ownerTransferService;
