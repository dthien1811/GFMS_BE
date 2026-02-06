import db from "../../models";
import { Op } from "sequelize";

const { Transaction, Gym, Member, User, Package } = db;

const parsePaging = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const ownerTransactionService = {
  async getMyTransactions(ownerUserId, query = {}) {
    const { page, limit, offset } = parsePaging(query);
    const { q, gymId, paymentStatus, transactionType } = query;

    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => g.id);

    if (gymIds.length === 0) {
      return {
        data: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      };
    }

    const where = {
      gymId: { [Op.in]: gymIds },
    };

    if (gymId) {
      where.gymId = Number(gymId);
    }

    const types = transactionType
      ? String(transactionType)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : ["package_purchase", "package_renewal"];

    if (types.length > 0) {
      where.transactionType = { [Op.in]: types };
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    if (q && String(q).trim()) {
      const keyword = String(q).trim();
      where[Op.or] = [
        { transactionCode: { [Op.like]: `%${keyword}%` } },
        { "$Member.User.username$": { [Op.like]: `%${keyword}%` } },
        { "$Member.User.email$": { [Op.like]: `%${keyword}%` } },
        { "$Gym.name$": { [Op.like]: `%${keyword}%` } },
        { "$Package.name$": { [Op.like]: `%${keyword}%` } },
      ];
    }

    const { rows, count } = await Transaction.findAndCountAll({
      where,
      include: [
        { model: Gym, attributes: ["id", "name"], required: false },
        { model: Package, attributes: ["id", "name", "price", "durationDays", "sessions"], required: false },
        {
          model: Member,
          attributes: ["id", "membershipNumber"],
          required: false,
          include: [{ model: User, attributes: ["id", "username", "email", "phone"], required: false }],
        },
      ],
      order: [["transactionDate", "DESC"], ["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return {
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  },
};

export default ownerTransactionService;
