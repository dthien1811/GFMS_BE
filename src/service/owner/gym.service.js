import db from "../../models";

const ownerGymService = {
  async getMyGyms(ownerUserId) {
    const gyms = await db.Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id", "name", "address", "phone", "email", "description", "status", "images", "ownerId", "createdAt", "updatedAt"],
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

        const gymData = gym.toJSON();
        
        // Parse images từ JSON string sang array
        if (gymData.images && typeof gymData.images === 'string') {
          try {
            gymData.images = JSON.parse(gymData.images);
          } catch (e) {
            gymData.images = [];
          }
        } else if (!Array.isArray(gymData.images)) {
          gymData.images = [];
        }

        return {
          ...gymData,
          totalMembers,
          totalTrainers,
          totalPackages,
        };
      })
    );

    return gymsWithStats;
  },

  async getAllGyms() {
    // Lấy tất cả gyms để owner có thể chọn khi tạo trainer share request
    const gyms = await db.Gym.findAll({
      attributes: ["id", "name", "address", "phone", "email", "description", "status", "ownerId"],
      order: [["name", "ASC"]],
      where: { status: "active" }, // Chỉ lấy gyms đang hoạt động
    });

    return gyms;
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

    const gymData = gym.toJSON();
    
    // Parse images từ JSON string sang array
    if (gymData.images && typeof gymData.images === 'string') {
      try {
        gymData.images = JSON.parse(gymData.images);
      } catch (e) {
        gymData.images = [];
      }
    } else if (!Array.isArray(gymData.images)) {
      gymData.images = [];
    }

    return gymData;
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

    const allowedFields = ["name", "address", "phone", "email", "description", "images"];
    const dataToUpdate = {};

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        dataToUpdate[field] = updateData[field];
      }
    });

    if (dataToUpdate.images !== undefined) {
      if (dataToUpdate.images === null || dataToUpdate.images === "") {
        dataToUpdate.images = null;
      } else if (Array.isArray(dataToUpdate.images)) {
        if (dataToUpdate.images.length === 0) {
          dataToUpdate.images = null;
        } else {
          dataToUpdate.images = JSON.stringify(dataToUpdate.images);
        }
      } else if (typeof dataToUpdate.images === "string") {
        dataToUpdate.images = dataToUpdate.images;
      }
    }

    await gym.update(dataToUpdate);
    await gym.reload();
    
    // Reload để lấy data mới nhất
    await gym.reload();
    
    const gymData = gym.toJSON();
    
    // Parse images từ JSON string sang array
    if (gymData.images && typeof gymData.images === 'string') {
      try {
        gymData.images = JSON.parse(gymData.images);
      } catch (e) {
        gymData.images = [];
      }
    } else if (!Array.isArray(gymData.images)) {
      gymData.images = [];
    }

    return gymData;
  },
};

export default ownerGymService;
