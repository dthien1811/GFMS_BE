// src/service/trainerRequestService.js
const realtimeModule = require("./realtime.service");
const realtimeService = realtimeModule.default || realtimeModule;

const typeLabelVi = (t) => {
  const key = String(t || "").trim().toLowerCase();
  if (key === "leave") return "nghỉ phép";
  if (key === "overtime") return "tăng ca";
  if (key === "shift_change") return "đổi ca";
  if (key === "transfer_branch") return "chuyển cơ sở";
  return "PT";
};

/**
 * Khi ORM không suy ra được gym (trainer.gymId null, v.v.), dùng SQL để bắt gym/owner
 * từ lịch dạy gần nhất — tránh PT gửi đơn mà owner không nhận thông báo.
 */
const resolveGymIdBySql = async (sequelize, requesterId) => {
  if (!sequelize || !requesterId) return null;
  try {
    const [fromBooking] = await sequelize.query(
      `SELECT b.gymId AS gymId
       FROM booking b
       INNER JOIN trainer t ON t.id = b.trainerId AND t.userId = :uid
       WHERE b.gymId IS NOT NULL
       ORDER BY b.createdAt DESC
       LIMIT 1`,
      { replacements: { uid: requesterId } }
    );
    const g1 = Number(fromBooking?.[0]?.gymId);
    if (Number.isInteger(g1) && g1 > 0) return g1;

    const [fromTrainer] = await sequelize.query(
      `SELECT t.gymId AS gymId FROM trainer t WHERE t.userId = :uid AND t.gymId IS NOT NULL LIMIT 1`,
      { replacements: { uid: requesterId } }
    );
    const g2 = Number(fromTrainer?.[0]?.gymId);
    if (Number.isInteger(g2) && g2 > 0) return g2;
  } catch (e) {
    console.warn("[trainerRequestService] resolveGymIdBySql:", e?.message || e);
  }
  return null;
};

class TrainerRequestService {
  constructor(models) {
    this.models = models;
  }

  // ===============================
  // Create trainer request
  // ===============================
  async createTrainerRequest({ requesterId, requestType, reason, data }) {
    const { Request, Trainer, Gym, User, Booking } = this.models;

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

    let trainer = null;
    try {
      if (Trainer) {
        trainer = await Trainer.findOne({
          where: { userId: requesterId },
          attributes: ["id", "gymId"],
        });
      }
    } catch (_e) {
      trainer = null;
    }

    const baseData =
      data && typeof data === "object" && !Array.isArray(data) ? { ...data } : {};

    let resolvedGymId = null;
    const fromPayload = Number(baseData.gymId);
    if (Number.isInteger(fromPayload) && fromPayload > 0) {
      resolvedGymId = fromPayload;
    } else if (trainer?.gymId) {
      const g = Number(trainer.gymId);
      if (Number.isInteger(g) && g > 0) resolvedGymId = g;
    }

    if (!resolvedGymId && trainer?.id && Booking) {
      try {
        const lastBk = await Booking.findOne({
          where: { trainerId: trainer.id },
          order: [["createdAt", "DESC"]],
          attributes: ["gymId"],
        });
        const bg = Number(lastBk?.gymId);
        if (Number.isInteger(bg) && bg > 0) resolvedGymId = bg;
      } catch (_e) {
        /* ignore */
      }
    }

    if (!resolvedGymId && this.models.sequelize) {
      const sqlGymId = await resolveGymIdBySql(this.models.sequelize, requesterId);
      if (sqlGymId) resolvedGymId = sqlGymId;
    }

    if (resolvedGymId && !baseData.gymId) {
      baseData.gymId = resolvedGymId;
    }

    const created = await Request.create({
      requesterId,
      requestType: normalizedType,
      status: "pending",
      reason: reason || null,
      data: Object.keys(baseData).length ? baseData : null,
    });

    try {
      if (realtimeService && resolvedGymId && Gym) {
        // Model Gym chỉ có `name`, không có `gymName` — nếu select nhầm cột sẽ lỗi SQL và không gửi được notify.
        const gym = await Gym.findByPk(resolvedGymId, {
          attributes: ["ownerId", "name"],
        });
        const ownerId = gym?.ownerId ? Number(gym.ownerId) : null;
        if (ownerId) {
          let requesterUser = null;
          try {
            requesterUser = User
              ? await User.findByPk(requesterId, { attributes: ["username"] })
              : null;
          } catch (_e) {
            requesterUser = null;
          }
          const uname = requesterUser?.username || `Tài khoản #${requesterId}`;
          const label = typeLabelVi(normalizedType);
          const reasonText = String(reason || "").trim();
          const gymLabel = gym?.name || `Chi nhánh #${resolvedGymId}`;
          const msg = reasonText
            ? `${uname} (${gymLabel}) đã gửi yêu cầu ${label}. Nội dung: ${reasonText.slice(0, 300)}`
            : `${uname} (${gymLabel}) đã gửi yêu cầu ${label}.`;
          await realtimeService.notifyUser(ownerId, {
            title: `Có yêu cầu ${label} mới cần duyệt`,
            message: msg,
            notificationType: "trainer_request",
            relatedType: "request",
            relatedId: created.id,
          });
          realtimeService.emitUser(ownerId, "request:changed", {
            requestId: created.id,
            status: "pending",
            action: "created",
            requestType: created.requestType,
          });
        } else {
          console.warn(
            "[trainerRequestService] gym has no ownerId; skip notify. gymId=",
            resolvedGymId
          );
        }
      } else if (!resolvedGymId) {
        console.warn(
          "[trainerRequestService] cannot resolve gymId for PT request; owner not notified. requesterId=",
          requesterId,
          "trainerId=",
          trainer?.id || null
        );
      }
    } catch (err) {
      console.error("[trainerRequestService] owner notify (create):", err?.message || err);
    }

    return created;
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

    request.status = "cancelled";
    await request.save();

    return request;
  }
}

module.exports = TrainerRequestService;
