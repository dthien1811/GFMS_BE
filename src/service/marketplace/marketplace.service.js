import db from "../../models";
import { Op } from "sequelize";

const marketplaceService = {
  async listGyms() {
    return db.Gym.findAll({ where: { status: "active" } });
  },

  async getGymDetail(id) {
  const gym = await db.Gym.findByPk(id, {
    include: [
      { model: db.User, as: "owner", attributes: ["username", "email"] },
    ],
  });

  if (!gym) return null;

  const data = gym.toJSON();

  // ✅ PARSE images
  try {
    data.images = data.images ? JSON.parse(data.images) : [];
  } catch {
    data.images = [];
  }

  return data;
},

  async listGymTrainers(gymId) {
    return db.Trainer.findAll({
      where: { gymId, isActive: true },
      include: [{ model: db.User, attributes: ["username", "avatar"] }],
    });
  },

  async listGymPackages(gymId) {
    return db.Package.findAll({
      where: { gymId, isActive: true },
    });
  },

  async listTrainers({ gymId }) {
  const where = { isActive: true };

  // 🔥 QUAN TRỌNG: lọc theo gym
  if (gymId) {
    where.gymId = gymId;
  }

  return db.Trainer.findAll({
    where,
    include: [
      {
        model: db.User,
        attributes: ["id", "username", "avatar"],
      },
    ],
  });
},

  async getTrainerDetail(id) {
    return db.Trainer.findByPk(id, {
      include: [
        { model: db.User },
        { model: db.Gym },
      ],
    });
  },

  async listTrainerPackages(trainerId) {
    return db.Package.findAll({
      where: { trainerId, isActive: true },
    });
  },

  async listPackages({ gymId, q }) {
  const where = { isActive: true };
  if (gymId) where.gymId = gymId;
  if (q) where.name = { [Op.like]: `%${q}%` };

  return db.Package.findAll({
    where,
    include: [
      {
        model: db.Gym,
        attributes: ["id", "name", "address"],
      },
    ],
  });
},

async getPackageDetail(id) {
  return db.Package.findByPk(id, {
    include: [
      {
        model: db.Gym,
        attributes: ["id", "name", "address"],
      },
    ],
  });
},
};
export default marketplaceService;
