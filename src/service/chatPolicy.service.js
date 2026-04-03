import { Op } from "sequelize";
import db from "../models";

async function getMemberByUserId(userId) {
  return db.Member.findOne({ where: { userId }, attributes: ["id", "gymId", "userId"] });
}

async function getTrainerByUserId(userId) {
  return db.Trainer.findOne({ where: { userId }, attributes: ["id", "gymId", "userId", "status"] });
}

const chatPolicyService = {
  async getAllowedTrainerIdsForMember(userId) {
    const member = await getMemberByUserId(userId);
    if (!member) return [];

    const [activations, bookings] = await Promise.all([
      db.PackageActivation.findAll({
        attributes: ["id"],
        include: [
          { model: db.Member, attributes: [], where: { id: member.id } },
          { model: db.Package, attributes: ["trainerId"], required: false },
          { model: db.Transaction, attributes: ["trainerId"], required: false },
        ],
        where: { status: { [Op.in]: ["active", "completed", "expired"] } },
      }),
      db.Booking.findAll({
        attributes: ["trainerId"],
        where: {
          memberId: member.id,
          trainerId: { [Op.ne]: null },
          status: { [Op.notIn]: ["cancelled", "no_show"] },
        },
      }),
    ]);

    const ids = new Set();
    for (const row of activations) {
      const pkgTrainerId = row.Package?.trainerId;
      const txTrainerId = row.Transaction?.trainerId;
      if (pkgTrainerId) ids.add(Number(pkgTrainerId));
      if (txTrainerId) ids.add(Number(txTrainerId));
    }
    for (const row of bookings) {
      if (row.trainerId) ids.add(Number(row.trainerId));
    }
    return [...ids];
  },

  async getAllowedMemberIdsForTrainer(userId) {
    const trainer = await getTrainerByUserId(userId);
    if (!trainer) return [];

    const [activations, bookings] = await Promise.all([
      db.PackageActivation.findAll({
        attributes: ["id", "memberId"],
        include: [
          { model: db.Package, attributes: ["trainerId"], required: false },
          { model: db.Transaction, attributes: ["trainerId"], required: false },
        ],
        where: { status: { [Op.in]: ["active", "completed", "expired"] } },
      }),
      db.Booking.findAll({
        attributes: ["memberId"],
        where: {
          trainerId: trainer.id,
          memberId: { [Op.ne]: null },
          status: { [Op.notIn]: ["cancelled", "no_show"] },
        },
      }),
    ]);

    const memberIds = new Set();
    for (const row of activations) {
      const pkgTrainerId = row.Package?.trainerId;
      const txTrainerId = row.Transaction?.trainerId;
      if (Number(pkgTrainerId) === Number(trainer.id) || Number(txTrainerId) === Number(trainer.id)) {
        if (row.memberId) memberIds.add(Number(row.memberId));
      }
    }
    for (const row of bookings) {
      if (row.memberId) memberIds.add(Number(row.memberId));
    }
    return [...memberIds];
  },

  async assertMemberCanChatTrainer(userId, trainerId) {
    const member = await getMemberByUserId(userId);
    if (!member) {
      const e = new Error("Chỉ hội viên mới được nhắn tin với PT.");
      e.statusCode = 403;
      throw e;
    }

    const trainer = await db.Trainer.findByPk(Number(trainerId), {
      attributes: ["id", "userId", "gymId", "status"],
      include: [{ model: db.User, attributes: ["id", "username", "avatar", "status"] }],
    });
    if (!trainer || !trainer.userId) {
      const e = new Error("PT không tồn tại hoặc chưa liên kết tài khoản.");
      e.statusCode = 404;
      throw e;
    }
    if (String(trainer.status || "active").toLowerCase() !== "active") {
      const e = new Error("PT hiện không hoạt động.");
      e.statusCode = 403;
      throw e;
    }

    const allowedIds = await this.getAllowedTrainerIdsForMember(userId);
    if (!allowedIds.includes(Number(trainerId))) {
      const e = new Error("Bạn chỉ có thể chat với PT thuộc gói đã mua hoặc PT đã từng phục vụ bạn.");
      e.statusCode = 403;
      throw e;
    }

    return { member, trainer };
  },

  async assertTrainerCanChatMember(userId, memberUserId) {
    const trainer = await getTrainerByUserId(userId);
    if (!trainer) {
      const e = new Error("Chỉ PT mới được nhắn tin với hội viên.");
      e.statusCode = 403;
      throw e;
    }

    const member = await db.Member.findOne({
      where: { userId: Number(memberUserId) },
      attributes: ["id", "userId", "gymId"],
      include: [{ model: db.User, attributes: ["id", "username", "avatar", "status"] }],
    });
    if (!member || !member.userId) {
      const e = new Error("Hội viên không tồn tại hoặc chưa liên kết tài khoản.");
      e.statusCode = 404;
      throw e;
    }

    const allowedMemberIds = await this.getAllowedMemberIdsForTrainer(userId);
    if (!allowedMemberIds.includes(Number(member.id))) {
      const e = new Error("PT chỉ có thể chat với hội viên thuộc gói hoặc booking có liên quan.");
      e.statusCode = 403;
      throw e;
    }

    return { trainer, member };
  },
};

export default chatPolicyService;
