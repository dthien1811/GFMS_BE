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

const isActivationCompleted = async (activation) => {
  if (!activation) return false;

  const status = String(activation.status || "").toLowerCase();
  if (status === "completed" || status === "expired") return true;

  const totalSessions =
    toInt(activation.totalSessions, 0) ||
    toInt(activation?.Package?.sessions, 0) ||
    toInt(activation.sessionsUsed, 0) ||
    toInt(activation.sessionsRemaining, 0) + toInt(activation.sessionsUsed, 0);

  const completedCount = await getCompletedBookingCount(activation.id);
  const bookedCount = await getBookedCount(activation.id);
  const sessionsUsed = toInt(activation.sessionsUsed, 0);
  const sessionsRemaining = toInt(activation.sessionsRemaining, 0);

  if (totalSessions > 0) {
    return (completedCount >= totalSessions && bookedCount >= totalSessions) || sessionsUsed >= totalSessions || sessionsRemaining <= 0;
  }

  return completedCount > 0 && bookedCount > 0 && completedCount >= bookedCount;
};

const getLatestCompletedBookingForActivation = async (activationId) => {
  return db.Booking.findOne({
    where: { packageActivationId: activationId, status: "completed" },
    include: [
      {
        model: db.Trainer,
        attributes: ["id", "userId"],
        include: [{ model: db.User, attributes: ["username", "avatar"] }],
      },
      { model: db.Package, attributes: ["id", "name", "gymId"] },
    ],
    order: [["bookingDate", "DESC"], ["startTime", "DESC"], ["id", "DESC"]],
  });
};

const buildTrainerTargetFromActivation = async (memberId, activation) => {
  if (!(await isActivationCompleted(activation))) return null;
  const latestBooking = await getLatestCompletedBookingForActivation(activation.id);
  if (!latestBooking?.trainerId) return null;
  const reviewed = await db.Review.findOne({
    where: { memberId, reviewType: "trainer", packageActivationId: activation.id },
  });
  if (reviewed) return null;
  return {
    reviewType: "trainer",
    bookingId: latestBooking.id,
    packageActivationId: activation.id,
    trainerId: latestBooking.trainerId,
    label: latestBooking.Trainer?.User?.username || `PT #${latestBooking.trainerId}`,
    subtitle: `${latestBooking.Package?.name || "Gói tập"} • hoàn thành gói`,
  };
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

    const activations = await db.PackageActivation.findAll({
      where: { memberId: member.id, status: { [Op.notIn]: ["cancelled"] } },
      include: [
        { model: db.Package, attributes: ["id", "name", "gymId", "sessions"] },
        { model: db.Member, attributes: ["id", "gymId"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    const trainer = [];
    const packages = [];
    const gyms = [];
    const courses = [];

    for (const activation of activations) {
      const completedByPackage = await isActivationCompleted(activation);
      if (!completedByPackage && String(activation.status || "").toLowerCase() !== "completed") continue;

      const totalSessions = toInt(activation.totalSessions, 0) || toInt(activation?.Package?.sessions, 0);
      const completedCount = await getCompletedBookingCount(activation.id);
      const latestBooking = await getLatestCompletedBookingForActivation(activation.id);

      const trainerTarget = await buildTrainerTargetFromActivation(member.id, activation);
      if (trainerTarget) trainer.push(trainerTarget);

      const packageReviewed = await db.Review.findOne({
        where: { memberId: member.id, reviewType: "package", packageActivationId: activation.id, packageId: activation.packageId },
      });
      if (!packageReviewed) {
        packages.push({
          reviewType: "package",
          packageActivationId: activation.id,
          packageId: activation.packageId,
          gymId: activation.Package?.gymId,
          label: activation.Package?.name || `Gói #${activation.packageId}`,
          subtitle: `Đã hoàn thành ${completedCount}/${totalSessions} buổi`,
        });
      }

      if (activation.Package?.gymId) {
        const gymReviewed = await db.Review.findOne({
          where: { memberId: member.id, reviewType: "gym", gymId: activation.Package.gymId, packageActivationId: activation.id },
        });
        if (!gymReviewed) {
          const gym = await db.Gym.findByPk(activation.Package.gymId, { attributes: ["id", "name"] });
          if (gym) {
            gyms.push({
              reviewType: "gym",
              gymId: gym.id,
              packageActivationId: activation.id,
              packageId: activation.packageId,
              label: gym.name,
              subtitle: `${activation.Package?.name || "Gói tập"} • hoàn thành gói`,
            });
          }
        }
      }

      if (latestBooking?.trainerId) {
        const reviewed = await db.Review.findOne({ where: { memberId: member.id, reviewType: "trainer", packageActivationId: activation.id } }).then(Boolean);
        courses.push({
          activationId: activation.id,
          packageName: activation?.Package?.name || latestBooking?.Package?.name || "Gói tập",
          trainerId: latestBooking.trainerId,
          trainerName: latestBooking?.Trainer?.User?.username || "PT",
          totalSessions,
          completedSessions: completedCount,
          reviewed,
        });
      }
    }

    return {
      trainer,
      package: packages,
      gym: gyms,
      courses,
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
        packageActivationId: activationId,
        reviewType: "trainer",
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
      const packageActivationId = Number(payload.packageActivationId);

      const booking = await db.Booking.findOne({
        where: { id: bookingId, memberId: member.id, trainerId, status: "completed" },
        include: [{ model: db.PackageActivation, include: [{ model: db.Package, attributes: ["id", "sessions", "gymId"] }] }],
      });
      const activation = booking?.PackageActivation || (packageActivationId
        ? await db.PackageActivation.findOne({
            where: { id: packageActivationId, memberId: member.id },
            include: [{ model: db.Package, attributes: ["id", "sessions", "gymId"] }],
          })
        : null);

      if (!booking || !activation || !(await isActivationCompleted(activation))) {
        throw Object.assign(
          new Error("Chỉ được đánh giá PT sau khi đã hoàn thành toàn bộ gói tập."),
          { statusCode: 403 }
        );
      }

      const exists = await db.Review.findOne({
        where: { memberId: member.id, reviewType, trainerId, packageActivationId: activation.id },
      });

      if (exists) {
        throw Object.assign(new Error("Bạn đã đánh giá PT cho gói tập này rồi."), {
          statusCode: 409,
        });
      }

      const row = await db.Review.create({
        memberId: member.id,
        trainerId,
        bookingId,
        packageActivationId: activation.id,
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
        },
        include: [{ model: db.Package, attributes: ["id", "name", "gymId", "sessions"] }],
      });

      if (!activation || !(await isActivationCompleted(activation))) {
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
      where: { id: packageActivationId, memberId: member.id },
      include: [{ model: db.Package, attributes: ["id", "name", "gymId", "sessions"] }],
    });

    if (!activation || !(await isActivationCompleted(activation)) || Number(activation.Package?.gymId) !== gymId) {
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