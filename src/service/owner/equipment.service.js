import db from "../../models";
import { Op } from "sequelize";

const { Equipment, Gym, EquipmentCategory, EquipmentStock } = db;

const parsePaging = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const ownerEquipmentService = {
  // Get all equipment for owner's gyms (via EquipmentStock)
  async getEquipments(ownerUserId, query) {
    const { page, limit, offset } = parsePaging(query);
    const { q, status, categoryId, gymId } = query;

    // Get owner's gyms - filter theo ownerUserId
    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => g.id);

    if (gymIds.length === 0) {
      return { data: [], meta: { page, limit, totalItems: 0, totalPages: 0 } };
    }

    const where = { gymId: { [Op.in]: gymIds } };

    if (gymId) {
      where.gymId = Number(gymId);
    }

    // Build Equipment where for filtering
    const equipmentWhere = {};
    if (status && status !== "all") {
      equipmentWhere.status = status;
    }
    if (categoryId && categoryId !== "all") {
      equipmentWhere.categoryId = Number(categoryId);
    }
    if (q) {
      equipmentWhere[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { code: { [Op.like]: `%${q}%` } },
      ];
    }

    const { rows, count } = await EquipmentStock.findAndCountAll({
      where,
      include: [
        {
          model: Equipment,
          as: "equipment",
          required: true,
          attributes: ["id", "name", "code", "categoryId", "status", "description"],
          where: equipmentWhere,
          include: [
            { model: EquipmentCategory, as: "category", required: false, attributes: ["id", "name"] },
          ],
        },
        { model: Gym, as: "gym", required: false, attributes: ["id", "name"] },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    // Flatten the response to show Equipment properties
    const data = rows.map((stock) => ({
      id: stock.equipment.id,
      name: stock.equipment.name,
      code: stock.equipment.code,
      status: stock.equipment.status,
      description: stock.equipment.description,
      categoryId: stock.equipment.categoryId,
      EquipmentCategory: stock.equipment.category,
      Gym: stock.gym,
      stock: {
        id: stock.id,
        quantity: stock.quantity,
        availableQuantity: stock.availableQuantity,
        reservedQuantity: stock.reservedQuantity,
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

  // Get equipment detail (with all stocks across owner's gyms)
  async getEquipmentDetail(ownerUserId, equipmentId) {
    // Get owner's gyms
    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => g.id);

    if (gymIds.length === 0) {
      throw { message: "Equipment not found", statusCode: 404 };
    }

    // Get equipment with stock info from owner's gyms only
    const stocks = await EquipmentStock.findAll({
      where: {
        equipmentId: Number(equipmentId),
        gymId: { [Op.in]: gymIds },
      },
      include: [
        {
          model: Equipment,
          as: "equipment",
          required: true,
          attributes: ["id", "name", "code", "categoryId", "status", "description", "brand", "model"],
          include: [{ model: EquipmentCategory, as: "category", required: false }],
        },
        { model: Gym, as: "gym", required: false, attributes: ["id", "name"] },
      ],
    });

    if (stocks.length === 0) {
      throw { message: "Equipment not found", statusCode: 404 };
    }

    // Return first stock's equipment with all stocks
    return {
      ...stocks[0].equipment.toJSON(),
      stocks: stocks.map((s) => ({
        id: s.id,
        gym: s.gym,
        quantity: s.quantity,
        availableQuantity: s.availableQuantity,
        reservedQuantity: s.reservedQuantity,
      })),
    };
  },

  // Get categories
  async getCategories() {
    return await EquipmentCategory.findAll({
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
    });
  },
};

export default ownerEquipmentService;
