import { Op } from "sequelize";
import db from "../../models";
import realtimeService from "../realtime.service";

function requireRating(rating) {
  const n = Number(rating);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    const e = new Error("Rating phải từ 1 đến 5.");
    e.statusCode = 400;
    throw e;
  }
  return n;
}

function requireComment(comment) {
  const text = String(comment || "").trim();
  if (text.length < 10) {
    const e = new Error("Nội dung đánh giá tối thiểu 10 ký tự.");
    e.statusCode = 400;
    throw e;
  }
  if (text.length > 2000) {
    const e = new Error("Nội dung đánh giá tối đa 2000 ký tự.");
    e.statusCode = 400;
    throw e;
  }
  return text;
}

async function getMemberByUserId(userId) {
  const member = await db.Member.findOne({
    where: { userId },
    attributes: ["id", "gymId"],
  });
  if (!member) {
    throw Object.assign(new Error("Không tìm thấy member."), { statusCode: 404 });
  }
  return member;
}

const toInt = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
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
  async listMine(userId) {
    const member = await getMemberByUserId(userId);
    return db.Review.findAll({
      where: { memberId: member.id },
      include: [
        {
          model: db.Trainer,
          attributes: ["id", "userId"],
          include: [{ model: db.User, attributes: ["id", "username", "avatar"] }],
          required: false,
        },
        { model: db.Gym, attributes: ["id", "name"], required: false },
        { model: db.Package, attributes: ["id", "name"], required: false },
        {
          model: db.Booking,
          attributes: ["id", "packageActivationId", "bookingDate", "startTime", "endTime"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
    });
  },

  async getMyReviews(userId) {
    return this.listMine(userId);
  },

  async getEligibleReviewTargets(userId) {
    const member = await getMemberByUserId(userId);

    const [bookings, activations, activeActivations] = await Promise.all([
      db.Booking.findAll({
        where: { memberId: member.id, status: "completed" },
        include: [
          {
            model: db.Trainer,
            attributes: ["id", "userId"],
            include: [{ model: db.User, attributes: ["username", "avatar"] }],
          },
        ],
        order: [["createdAt", "DESC"]],
      }),
      db.PackageActivation.findAll({
        where: { memberId: member.id, status: "completed" },
        include: [
          { model: db.Package, attributes: ["id", "name", "gymId", "sessions"] },
          { model: db.Member, attributes: ["id", "gymId"] },
        ],
        order: [["createdAt", "DESC"]],
      }),
      db.PackageActivation.findAll({
        where: { memberId: member.id, status: "active" },
        include: [{ model: db.Package, attributes: ["id", "name", "sessions", "gymId"] }],
        order: [["id", "DESC"]],
      }),
    ]);

    const trainer = bookings.map((b) => ({
      reviewType: "trainer",
      bookingId: b.id,
      trainerId: b.trainerId,
      label: b.Trainer?.User?.username || `PT #${b.trainerId}`,
      subtitle: `${b.bookingDate ? new Date(b.bookingDate).toLocaleDateString("vi-VN") : "Buổi tập"}${b.startTime && b.endTime ? ` • ${String(b.startTime).slice(0, 5)}-${String(b.endTime).slice(0, 5)}` : ""}`,
    }));

    const packages = activations.map((a) => ({
      reviewType: "package",
      packageActivationId: a.id,
      packageId: a.packageId,
      gymId: a.Package?.gymId,
      label: a.Package?.name || `Gói #${a.packageId}`,
      subtitle: `Gói đã hoàn thành #${a.id}`,
    }));

    const gymsMap = new Map();
    for (const a of activations) {
      if (!a.Package?.gymId) continue;
      if (gymsMap.has(a.Package.gymId)) continue;

      const gym = await db.Gym.findByPk(a.Package.gymId, { attributes: ["id", "name"] });
      if (!gym) continue;

      gymsMap.set(gym.id, {
        reviewType: "gym",
        gymId: gym.id,
        packageActivationId: a.id,
        packageId: a.packageId,
        label: gym.name,
        subtitle: "Đủ điều kiện đánh giá phòng gym",
      });
    }

    // Alias dữ liệu kiểu dev cũ: eligible-courses
    const eligibleCourses = [];
    for (const a of activeActivations) {
      const totalSessions = toInt(a.totalSessions, 0) || toInt(a?.Package?.sessions, 0);
      if (totalSessions <= 0) continue;

      const completedCount = await getCompletedBookingCount(a.id);
      const bookedCount = await getBookedCount(a.id);

      const isCompletedByCount =
        completedCount >= totalSessions && bookedCount >= totalSessions;
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
            include: [{ model: db.User, attributes: ["username", "avatar"] }],
          },
          { model: db.Package, attributes: ["id", "name"] },
        ],
        order: [["bookingDate", "DESC"], ["startTime", "DESC"], ["id", "DESC"]],
      });

      if (!latestBooking?.trainerId) continue;

      const reviewed = await hasReviewForActivation(member.id, a.id);

      eligibleCourses.push({
        activationId: a.id,
        packageName: a?.Package?.name || latestBooking?.Package?.name || "Gói tập",
        trainerId: latestBooking.trainerId,
        trainerName: latestBooking?.Trainer?.User?.username || "PT",
        totalSessions,
        completedSessions: completedCount,
        reviewed,
      });
    }

    return {
      trainer,
      package: packages,
      gym: [...gymsMap.values()],
      courses: eligibleCourses,
    };
  },

  async getEligibleCourses(userId) {
    const data = await this.getEligibleReviewTargets(userId);
    return data?.courses || [];
  },

  async create(userId, payload) {
    const member = await getMemberByUserId(userId);

    // Tương thích payload cũ của dev
    if (!payload?.reviewType && payload?.activationId) {
      const activationId = Number(payload.activationId);
      const rating = requireRating(payload.rating);
      const comment = requireComment(payload.comment);

      const eligible = await this.getEligibleCourses(userId);
      const selected = eligible.find((x) => Number(x.activationId) === activationId);

      if (!selected) {
        throw Object.assign(new Error("Khóa học chưa đủ điều kiện đánh giá"), {
          statusCode: 400,
        });
      }

      if (selected.reviewed) {
        throw Object.assign(new Error("Khóa học này đã được đánh giá"), {
          statusCode: 409,
        });
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
        throw Object.assign(
          new Error("Không tìm thấy buổi học hoàn thành để gắn đánh giá"),
          { statusCode: 400 }
        );
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
    }

    const reviewType = String(payload.reviewType || "").trim().toLowerCase();
    const rating = requireRating(payload.rating);
    const comment = requireComment(payload.comment);

    if (!["trainer", "gym", "package"].includes(reviewType)) {
      throw Object.assign(new Error("reviewType không hợp lệ."), { statusCode: 400 });
    }

    if (reviewType === "trainer") {
      const trainerId = Number(payload.trainerId);
      const bookingId = Number(payload.bookingId);

      const booking = await db.Booking.findOne({
        where: { id: bookingId, memberId: member.id, trainerId, status: "completed" },
      });

      if (!booking) {
        throw Object.assign(
          new Error("Chỉ được đánh giá PT sau buổi tập đã hoàn thành."),
          { statusCode: 403 }
        );
      }

      const exists = await db.Review.findOne({
        where: { memberId: member.id, reviewType, trainerId, bookingId },
      });

      if (exists) {
        throw Object.assign(new Error("Bạn đã đánh giá PT cho booking này rồi."), {
          statusCode: 409,
        });
      }

      const row = await db.Review.create({
        memberId: member.id,
        trainerId,
        bookingId,
        reviewType,
        rating,
        comment,
        status: "active",
      });

      const trainer = await db.Trainer.findByPk(trainerId, { attributes: ["userId"] });
      await realtimeService.notifyUser(trainer?.userId, {
        title: "Bạn có đánh giá mới",
        message: comment.slice(0, 160),
        notificationType: "review",
        relatedType: "review",
        relatedId: row.id,
      });

      return row;
    }

    if (reviewType === "package") {
      const packageActivationId = Number(payload.packageActivationId);
      const packageId = Number(payload.packageId);

      const activation = await db.PackageActivation.findOne({
        where: {
          id: packageActivationId,
          memberId: member.id,
          packageId,
          status: "completed",
        },
        include: [{ model: db.Package, attributes: ["id", "name", "gymId"] }],
      });

      if (!activation) {
        throw Object.assign(
          new Error("Chỉ được đánh giá gói sau khi gói đã hoàn thành."),
          { statusCode: 403 }
        );
      }

      const exists = await db.Review.findOne({
        where: {
          memberId: member.id,
          reviewType,
          packageActivationId,
          packageId,
        },
      });

      if (exists) {
        throw Object.assign(new Error("Bạn đã đánh giá gói này rồi."), {
          statusCode: 409,
        });
      }

      const row = await db.Review.create({
        memberId: member.id,
        packageId,
        gymId: activation.Package?.gymId || null,
        packageActivationId,
        reviewType,
        rating,
        comment,
        status: "active",
      });

      return row;
    }

    const gymId = Number(payload.gymId);
    const packageActivationId = Number(payload.packageActivationId);

    const activation = await db.PackageActivation.findOne({
      where: { id: packageActivationId, memberId: member.id, status: "completed" },
      include: [{ model: db.Package, attributes: ["id", "name", "gymId"] }],
    });

    if (!activation || Number(activation.Package?.gymId) !== gymId || Number(member.gymId) !== gymId) {
      throw Object.assign(
        new Error("Bạn chỉ được đánh giá gym khi đã hoàn thành ít nhất 1 gói của gym đó."),
        { statusCode: 403 }
      );
    }

    const exists = await db.Review.findOne({
      where: { memberId: member.id, reviewType, gymId, packageActivationId },
    });

    if (exists) {
      throw Object.assign(new Error("Bạn đã đánh giá gym này cho gói đã hoàn thành đó rồi."), {
        statusCode: 409,
      });
    }

    const row = await db.Review.create({
      memberId: member.id,
      gymId,
      packageId: activation.packageId,
      packageActivationId,
      reviewType,
      rating,
      comment,
      status: "active",
    });

    const gym = await db.Gym.findByPk(gymId, { attributes: ["ownerId"] });
    await realtimeService.notifyUser(gym?.ownerId, {
      title: "Gym có đánh giá mới",
      message: comment.slice(0, 160),
      notificationType: "review",
      relatedType: "review",
      relatedId: row.id,
    });

    return row;
  },

  async createReview(userId, payload) {
    return this.create(userId, payload);
  },
};

export default reviewService;