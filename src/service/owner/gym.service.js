import db from "../../models";

const ownerGymService = {
  async getMyGyms(ownerUserId) {
    const gyms = await db.Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id", "name", "address", "phone", "email", "description", "status", "images", "ownerId", "createdAt"],
      order: [["createdAt", "DESC"]],
    });

    // Đếm số lượng members, trainers, packages cho mỗi gym
    const gymsWithStats = await Promise.all(
      gyms.map(async (gym) => {
        const [totalMembers, totalTrainers, totalPackages] = await Promise.all([
          db.Member.count({ where: { gymId: gym.id } }),
          db.Trainer.count({ where: { gymId: gym.id } }),
          db.Package.count({ where: { gymId: gym.id } }),
        ]);

        return {
          ...gym.toJSON(),
          totalMembers,
          totalTrainers,
          totalPackages,
        };
      })
    );

    return gymsWithStats;
  },

  async getGymDetail(ownerUserId, gymId) {
    const gym = await db.Gym.findOne({
      where: { id: gymId, ownerId: ownerUserId },
      include: [
        {
          model: db.User,
          as: "owner",
          attributes: ["id", "username", "email"],
        },
      ],
    });

    if (!gym) {
      const error = new Error("Không tìm thấy gym hoặc bạn không có quyền truy cập");
      error.statusCode = 404;
      throw error;
    }

    return gym;
  },

  async updateGym(ownerUserId, gymId, updateData) {
    const gym = await db.Gym.findOne({
      where: { id: gymId, ownerId: ownerUserId },
    });

    if (!gym) {
      const error = new Error("Không tìm thấy gym hoặc bạn không có quyền chỉnh sửa");
      error.statusCode = 404;
      throw error;
    }

    const allowedFields = ["name", "address", "phone", "email", "description"];
    const dataToUpdate = {};

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        dataToUpdate[field] = updateData[field];
      }
    });

    await gym.update(dataToUpdate);

    return gym;
  },
};

export default ownerGymService;
