// src/service/trainerRequestService.js
class TrainerRequestService {
  constructor(models) {
    this.models = models;
  }

  // ===============================
  // Create trainer request
  // ===============================
  async createTrainerRequest({ requesterId, requestType, reason, data }) {
    const { Request } = this.models;

    // dùng lowercase toàn bộ
    const allowedTypes = [
      "leave",
      "shift_change",
      "transfer_branch",
      "overtime",
    ];

    const normalizedType = String(requestType || "")
      .trim()
      .toLowerCase();

    if (!allowedTypes.includes(normalizedType)) {
      throw new Error(`Invalid request type: "${requestType}"`);
    }

    const row = await Request.create({
      requesterId,
      requestType: normalizedType,
      status: "pending",
      reason: reason || null,
      data: data || null,
    });

    try {
      const realtimeServiceModule = require("./realtime.service");
      const realtimeService = realtimeServiceModule.default || realtimeServiceModule;
      const { Trainer, Gym, User } = this.models;
      const trainer = await Trainer.findOne({
        where: { userId: requesterId },
        attributes: ["id", "gymId"],
      });
      if (trainer?.gymId) {
        const gym = await Gym.findByPk(trainer.gymId, { attributes: ["ownerId", "name"] });
        const ownerId = gym?.ownerId ? Number(gym.ownerId) : null;
        if (ownerId) {
          const requester = await User.findByPk(requesterId, { attributes: ["username", "email"] });
          const label = requester?.username || requester?.email || `PT #${trainer.id}`;
          const typeVi =
            {
              leave: "nghỉ phép",
              shift_change: "đổi ca",
              transfer_branch: "chuyển chi nhánh",
              overtime: "tăng ca",
            }[normalizedType] || normalizedType;
          await realtimeService.notifyUser(ownerId, {
            title: "Yêu cầu mới từ huấn luyện viên",
            message: `${label} gửi yêu cầu ${typeVi}.`,
            notificationType: "trainer_request",
            relatedType: "request",
            relatedId: row.id,
          });
          realtimeService.emitUser(ownerId, "request:changed", {
            requestId: row.id,
            action: "created",
          });
        }
      }
    } catch (e) {
      console.error("[trainerRequestService] notify owner:", e?.message || e);
    }

    return row;
  }

  // ===============================
  // Get my requests (filter)
  // ===============================
  async getMyRequests({ requesterId, status, requestType }) {
    const { Request, User } = this.models;

    const where = { requesterId };

    if (status) {
      where.status = String(status).trim().toLowerCase();
    }

    if (requestType) {
      where.requestType = String(requestType).trim().toLowerCase();
    }

    return Request.findAll({
      where,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: User,
          as: "requester",
          attributes: ["id", "username", "email"],
        },
        {
          model: User,
          as: "approver",
          attributes: ["id", "username", "email"],
        },
      ],
    });
  }

  // ===============================
  // Cancel request (only pending)
  // ===============================
  async cancelTrainerRequest({ requesterId, requestId }) {
    const { Request } = this.models;

    const request = await Request.findOne({
      where: { id: requestId, requesterId },
    });

    if (!request) {
      throw new Error("Request not found");
    }

    const currentStatus = String(request.status || "")
      .trim()
      .toLowerCase();

    if (currentStatus !== "pending") {
      throw new Error(
        `Only pending request can be cancelled (current: "${request.status}")`
      );
    }

    request.status = "CANCELLED";
    await request.save();

    return request;
  }
}

module.exports = TrainerRequestService;
