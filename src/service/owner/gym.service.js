import db from "../../models";

const ownerGymService = {
  async getMyGyms(ownerUserId) {
    const gyms = await db.Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id", "name", "address", "status", "ownerId"],
      order: [["createdAt", "DESC"]],
    });

    return gyms;
  },
};

export default ownerGymService;
