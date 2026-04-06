import db from "../../models";

const { EquipmentStock, Equipment, EquipmentUnit, Gym } = db;

const parsePaging = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const buildUnitSummaryMap = async (rows = []) => {
  const pairs = rows
    .map((row) => ({ equipmentId: Number(row.equipmentId), gymId: Number(row.gymId) }))
    .filter((row) => row.equipmentId && row.gymId);

  if (!pairs.length) return new Map();

  const equipmentIds = [...new Set(pairs.map((row) => row.equipmentId))];
  const gymIds = [...new Set(pairs.map((row) => row.gymId))];

  const units = await EquipmentUnit.findAll({
    attributes: ["equipmentId", "gymId", "status", "usageStatus", [db.Sequelize.fn("COUNT", db.Sequelize.col("id")), "count"]],
    where: {
      equipmentId: { [db.Sequelize.Op.in]: equipmentIds },
      gymId: { [db.Sequelize.Op.in]: gymIds },
    },
    group: ["equipmentId", "gymId", "status", "usageStatus"],
    raw: true,
  });

  const summary = new Map();
  units.forEach((unit) => {
    const key = `${unit.gymId}:${unit.equipmentId}`;
    const current = summary.get(key) || {
      activeQuantity: 0,
      inStockQuantity: 0,
      inUseQuantity: 0,
      maintenanceQuantity: 0,
      transferPendingQuantity: 0,
      disposedQuantity: 0,
    };
    const count = Number(unit.count || 0);
    if (unit.status === "active") {
      current.activeQuantity += count;
      if (unit.usageStatus === "in_use") current.inUseQuantity += count;
      else current.inStockQuantity += count;
    }
    if (unit.status === "in_maintenance") current.maintenanceQuantity += count;
    if (unit.status === "transfer_pending") current.transferPendingQuantity += count;
    if (unit.status === "disposed") current.disposedQuantity += count;
    summary.set(key, current);
  });

  return summary;
};

const ownerInventoryService = {
  // Get inventory (stocks) for owner's gyms
  async getInventory(ownerUserId, query) {
    const { page, limit, offset } = parsePaging(query);
    const { q, gymId } = query;

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

    const where = { gymId: { [db.Sequelize.Op.in]: gymIds } };

    if (gymId) {
      where.gymId = Number(gymId);
    }

    let query_search = {};
    if (q) {
      query_search = { [db.Sequelize.Op.or]: [
        { "$equipment.name$": { [db.Sequelize.Op.like]: `%${q}%` } },
        { "$equipment.code$": { [db.Sequelize.Op.like]: `%${q}%` } },
      ]};
    }

    const { rows, count } = await EquipmentStock.findAndCountAll({
      attributes: ["id", "equipmentId", "gymId", "quantity", "reservedQuantity", "availableQuantity", "location", "reorderPoint", "lastRestocked"],
      where: { ...where, ...query_search },
      include: [
        { model: Gym, as: "gym", required: false, attributes: ["id", "name"] },
        { model: Equipment, as: "equipment", required: false, attributes: ["id", "name", "code", "minStockLevel"] },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    const unitSummaryMap = await buildUnitSummaryMap(rows);

    const data = rows.map((row) => ({
      ...row.toJSON(),
      unitSummary:
        unitSummaryMap.get(`${row.gymId}:${row.equipmentId}`) || {
          activeQuantity: Number(row.availableQuantity || 0),
          inStockQuantity: Number(row.availableQuantity || 0),
          inUseQuantity: 0,
          maintenanceQuantity: 0,
          transferPendingQuantity: 0,
          disposedQuantity: 0,
        },
    }));

    return {
      data,
      meta: {
        page,
        limit,
        totalItems: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  },

  // Get inventory detail
  async getInventoryDetail(ownerUserId, stockId) {
    const stock = await EquipmentStock.findByPk(stockId, {
      include: [
        { model: Gym, as: "gym", required: false, attributes: ["id", "name", "ownerId"] },
        { model: Equipment, as: "equipment", required: false, attributes: ["id", "name", "code", "minStockLevel"] },
      ],
    });

    if (!stock) {
      throw { message: "Stock not found", statusCode: 404 };
    }

    // Check authorization
    if (stock.gym && stock.gym.ownerId !== ownerUserId) {
      throw { message: "Not authorized", statusCode: 403 };
    }

    return stock;
  },
};

export default ownerInventoryService;
