import db from "../../models";

const { EquipmentStock, Equipment, Gym } = db;

const parsePaging = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
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

    const where = { gymId: { gymId: gymIds } };

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
      where: { gymId: { [db.Sequelize.Op.in]: gymIds }, ...query_search },
      include: [
        { model: Gym, as: "gym", required: false, attributes: ["id", "name"] },
        { model: Equipment, as: "equipment", required: false, attributes: ["id", "name", "code"] },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return {
      data: rows,
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
        { model: Equipment, as: "equipment", required: false },
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
