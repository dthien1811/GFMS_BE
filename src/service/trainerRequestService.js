// src/service/trainerRequestService.js
class TrainerRequestService {
  constructor(models) {
    this.models = models;
  }

  async createTrainerRequest({ requesterId, requestType, reason, data }) {
    const { Request } = this.models;

    const allowedTypes = ["LEAVE", "SHIFT_CHANGE", "TRANSFER_BRANCH", "OVERTIME"];
    if (!allowedTypes.includes(requestType)) {
      throw new Error("Invalid request type");
    }

    return Request.create({
      requesterId,
      requestType,
      status: "PENDING",
      reason: reason || null,
      data: data || null,
    });
  }

  async getMyRequests({ requesterId, status, requestType }) {
  const { Request, User } = this.models;

  const where = { requesterId };
  if (status) where.status = status;
  if (requestType) where.requestType = requestType;

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


  async cancelTrainerRequest({ requesterId, requestId }) {
    const { Request } = this.models;

    const request = await Request.findOne({
      where: { id: requestId, requesterId },
    });

    if (!request) throw new Error("Request not found");
    if (request.status !== "PENDING") {
      throw new Error("Only PENDING request can be cancelled");
    }

    request.status = "CANCELLED";
    await request.save();
    return request;
  }
}

module.exports = TrainerRequestService;
