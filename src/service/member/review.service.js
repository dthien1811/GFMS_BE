import db from "../../models";
import { Op } from "sequelize";

const toInt = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const getMemberOrThrow = async (userId) => {
  const member = await db.Member.findOne({ where: { userId } });
  if (!member) {
    const e = new Error("Không tìm thấy hồ sơ hội viên");
    e.statusCode = 404;
    throw e;
  }
  return member;
};

const getCompletedBookingCount = async (activationId) => {
  return db.Booking.count({
    where: {
      packageActivationId: activationId,
      status: "completed",
    },
  });
};

const getBookedCount = async (activationId) => {
  return db.Booking.count({
    where: {
      packageActivationId: activationId,
      status: { [Op.ne]: "cancelled" },
    },
  });
};

const hasReviewForActivation = async (memberId, activationId) => {
  const existing = await db.Review.findOne({
    where: { memberId },
    include: [
      {
        model: db.Booking,
        attributes: ["id", "packageActivationId"],
        required: true,
        where: { packageActivationId: activationId },
      },
    ],
  });
  return !!existing;
};

const reviewService = {
  async getEligibleCourses(userId) {
    const member = await getMemberOrThrow(userId);

    const activations = await db.PackageActivation.findAll({
      where: { memberId: member.id, status: "active" },
      include: [{ model: db.Package, attributes: ["id", "name", "sessions"] }],
      order: [["id", "DESC"]],
    });

    const items = [];
    for (const a of activations) {
      const totalSessions =
        toInt(a.totalSessions, 0) || toInt(a?.Package?.sessions, 0);
      if (totalSessions <= 0) continue;

      const completedCount = await getCompletedBookingCount(a.id);
      const bookedCount = await getBookedCount(a.id);
      const isCompletedByCount = completedCount >= totalSessions && bookedCount >= totalSessions;
      const sessionsUsed = toInt(a.sessionsUsed, 0);
      const isCompletedByCounter = sessionsUsed >= totalSessions;
      const isCompleted = isCompletedByCount || isCompletedByCounter;
      if (!isCompleted) continue;

      const latestBooking = await db.Booking.findOne({
        where: { packageActivationId: a.id, status: "completed" },
        include: [
          {
            model: db.Trainer,
            attributes: ["id"],
            include: [{ model: db.User, attributes: ["username"] }],
          },
          { model: db.Package, attributes: ["id", "name"] },
        ],
        order: [["bookingDate", "DESC"], ["startTime", "DESC"], ["id", "DESC"]],
      });
      if (!latestBooking?.trainerId) continue;

      const reviewed = await hasReviewForActivation(member.id, a.id);

      items.push({
        activationId: a.id,
        packageName: a?.Package?.name || latestBooking?.Package?.name || "Gói tập",
        trainerId: latestBooking.trainerId,
        trainerName: latestBooking?.Trainer?.User?.username || "PT",
        totalSessions,
        completedSessions: completedCount,
        reviewed,
      });
    }

    return items;
  },

  async getMyReviews(userId) {
    const member = await getMemberOrThrow(userId);

    const rows = await db.Review.findAll({
      where: { memberId: member.id },
      include: [
        {
          model: db.Trainer,
          attributes: ["id"],
          include: [{ model: db.User, attributes: ["username"] }],
        },
        {
          model: db.Booking,
          attributes: ["id", "packageActivationId", "bookingDate"],
          include: [{ model: db.Package, attributes: ["id", "name"] }],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return rows;
  },

  async createReview(userId, payload) {
    const member = await getMemberOrThrow(userId);
    const activationId = Number(payload?.activationId);
    const rating = Number(payload?.rating);
    const comment = String(payload?.comment || "").trim();

    if (!activationId) {
      const e = new Error("Thiếu activationId");
      e.statusCode = 400;
      throw e;
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      const e = new Error("rating phải từ 1 đến 5");
      e.statusCode = 400;
      throw e;
    }
    if (!comment) {
      const e = new Error("Vui lòng nhập nội dung đánh giá");
      e.statusCode = 400;
      throw e;
    }

    const eligible = await this.getEligibleCourses(userId);
    const selected = eligible.find((x) => Number(x.activationId) === activationId);
    if (!selected) {
      const e = new Error("Khóa học chưa đủ điều kiện đánh giá");
      e.statusCode = 400;
      throw e;
    }
    if (selected.reviewed) {
      const e = new Error("Khóa học này đã được đánh giá");
      e.statusCode = 409;
      throw e;
    }

    const booking = await db.Booking.findOne({
      where: {
        packageActivationId: activationId,
        trainerId: selected.trainerId,
        status: "completed",
      },
      order: [["bookingDate", "DESC"], ["startTime", "DESC"], ["id", "DESC"]],
    });
    if (!booking) {
      const e = new Error("Không tìm thấy buổi học hoàn thành để gắn đánh giá");
      e.statusCode = 400;
      throw e;
    }

    const row = await db.Review.create({
      memberId: member.id,
      trainerId: selected.trainerId,
      bookingId: booking.id,
      rating,
      comment,
      status: "active",
    });

    return row;
  },
};

export default reviewService;
