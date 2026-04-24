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

const toInt = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

async function getMemberByUserId(userId) {
  const member = await db.Member.findOne({
    where: { userId },
    attributes: ["id", "gymId"],
  });

  if (!member) {
    throw Object.assign(new Error("Không tìm thấy member."), {
      statusCode: 404,
    });
  }

  return member;
}

function getTotalSessions(activation) {
  return (
    toInt(activation?.totalSessions, 0) ||
    toInt(activation?.Package?.sessions, 0) ||
    toInt(activation?.sessionsUsed, 0) + toInt(activation?.sessionsRemaining, 0)
  );
}

function isActivationCompletedFast(activation, completedCount) {
  if (!activation) return false;

  const totalSessions = getTotalSessions(activation);
  const sessionsUsed = toInt(activation.sessionsUsed, 0);

  if (totalSessions > 0) {
    return completedCount >= totalSessions || sessionsUsed >= totalSessions;
  }

  return completedCount > 0;
}

async function getCompletedBookingCount(activationId) {
  return db.Booking.count({
    where: {
      packageActivationId: activationId,
      status: "completed",
    },
  });
}

async function getLatestCompletedBookingForActivation(activationId) {
  return db.Booking.findOne({
    where: {
      packageActivationId: activationId,
      status: "completed",
    },
    include: [
      {
        model: db.Trainer,
        attributes: ["id", "userId"],
        include: [{ model: db.User, attributes: ["username", "avatar"] }],
      },
      { model: db.Package, attributes: ["id", "name", "gymId"] },
    ],
    order: [
      ["bookingDate", "DESC"],
      ["startTime", "DESC"],
      ["id", "DESC"],
    ],
  });
}

async function isActivationCompleted(activation) {
  if (!activation) return false;

  const completedCount = await getCompletedBookingCount(activation.id);
  return isActivationCompletedFast(activation, completedCount);
}

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
      where: {
        memberId: member.id,
        status: { [Op.notIn]: ["cancelled"] },
      },
      include: [
        { model: db.Package, attributes: ["id", "name", "gymId", "sessions"] },
        { model: db.Member, attributes: ["id", "gymId"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    if (!activations.length) {
      return { trainer: [], package: [], gym: [], courses: [] };
    }

    const activationIds = activations.map((a) => a.id);
    const packageIds = [...new Set(activations.map((a) => a.packageId).filter(Boolean))];
    const gymIds = [
      ...new Set(
        activations
          .map((a) => a.Package?.gymId)
          .filter(Boolean)
      ),
    ];

    const [completedBookings, existingReviews, gyms] = await Promise.all([
      db.Booking.findAll({
        where: {
          packageActivationId: activationIds,
          status: "completed",
        },
        include: [
          {
            model: db.Trainer,
            attributes: ["id", "userId"],
            include: [{ model: db.User, attributes: ["username", "avatar"] }],
            required: false,
          },
          {
            model: db.Package,
            attributes: ["id", "name", "gymId"],
            required: false,
          },
        ],
        order: [
          ["packageActivationId", "ASC"],
          ["bookingDate", "DESC"],
          ["startTime", "DESC"],
          ["id", "DESC"],
        ],
      }),

      db.Review.findAll({
        where: {
          memberId: member.id,
          [Op.or]: [
            { packageActivationId: activationIds },
            { packageId: packageIds },
            { gymId: gymIds },
          ],
        },
        attributes: [
          "id",
          "reviewType",
          "trainerId",
          "gymId",
          "packageId",
          "packageActivationId",
        ],
      }),

      gymIds.length
        ? db.Gym.findAll({
            where: { id: gymIds },
            attributes: ["id", "name"],
          })
        : [],
    ]);

    const gymById = new Map(gyms.map((g) => [Number(g.id), g]));

    const completedCountByActivation = new Map();
    const latestBookingByActivation = new Map();

    for (const booking of completedBookings) {
      const activationId = Number(booking.packageActivationId);
      completedCountByActivation.set(
        activationId,
        Number(completedCountByActivation.get(activationId) || 0) + 1
      );

      if (!latestBookingByActivation.has(activationId)) {
        latestBookingByActivation.set(activationId, booking);
      }
    }

    const reviewKeySet = new Set();

    for (const r of existingReviews) {
      const type = String(r.reviewType || "").toLowerCase();
      const activationId = Number(r.packageActivationId || 0);

      if (type === "trainer") {
        reviewKeySet.add(`trainer:${activationId}:${Number(r.trainerId || 0)}`);
      }

      if (type === "package") {
        reviewKeySet.add(`package:${activationId}:${Number(r.packageId || 0)}`);
      }

      if (type === "gym") {
        reviewKeySet.add(`gym:${activationId}:${Number(r.gymId || 0)}`);
      }
    }

    const trainer = [];
    const packages = [];
    const gymsTargets = [];
    const courses = [];

    for (const activation of activations) {
      const activationId = Number(activation.id);
      const completedCount = Number(completedCountByActivation.get(activationId) || 0);
      const totalSessions = getTotalSessions(activation);

      const completedByPackage = isActivationCompletedFast(activation, completedCount);

      if (!completedByPackage) continue;

      const latestBooking = latestBookingByActivation.get(activationId) || null;

      if (latestBooking?.trainerId) {
        const trainerId = Number(latestBooking.trainerId);
        const trainerReviewKey = `trainer:${activationId}:${trainerId}`;

        if (!reviewKeySet.has(trainerReviewKey)) {
          trainer.push({
            reviewType: "trainer",
            bookingId: latestBooking.id,
            packageActivationId: activationId,
            trainerId,
            label: latestBooking.Trainer?.User?.username || `PT #${trainerId}`,
            subtitle: `${latestBooking.Package?.name || activation.Package?.name || "Gói tập"} • Hoàn thành gói`,
          });

          courses.push({
            activationId,
            packageName: activation?.Package?.name || latestBooking?.Package?.name || "Gói tập",
            trainerId,
            trainerName: latestBooking?.Trainer?.User?.username || "PT",
            totalSessions,
            completedSessions: completedCount,
            reviewed: false,
          });
        }
      }

      const packageId = Number(activation.packageId || activation.Package?.id || 0);
      const gymId = Number(activation.Package?.gymId || 0);

      if (packageId) {
        const packageReviewKey = `package:${activationId}:${packageId}`;

        if (!reviewKeySet.has(packageReviewKey)) {
          packages.push({
            reviewType: "package",
            packageActivationId: activationId,
            packageId,
            gymId,
            label: activation.Package?.name || `Gói #${packageId}`,
            subtitle: `Đã hoàn thành ${completedCount}/${totalSessions || completedCount} buổi`,
          });
        }
      }

      if (gymId) {
        const gymReviewKey = `gym:${activationId}:${gymId}`;
        const gym = gymById.get(gymId);

        if (gym && !reviewKeySet.has(gymReviewKey)) {
          gymsTargets.push({
            reviewType: "gym",
            gymId,
            packageActivationId: activationId,
            packageId,
            label: gym.name,
            subtitle: `${activation.Package?.name || "Gói tập"} • Hoàn thành gói`,
          });
        }
      }
    }

    return {
      trainer,
      package: packages,
      gym: gymsTargets,
      courses,
    };
  },

  async getEligibleCourses(userId) {
    const data = await this.getEligibleReviewTargets(userId);
    return data?.courses || [];
  },

  async create(userId, payload) {
    const member = await getMemberByUserId(userId);

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
        order: [
          ["bookingDate", "DESC"],
          ["startTime", "DESC"],
          ["id", "DESC"],
        ],
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
      throw Object.assign(new Error("reviewType không hợp lệ."), {
        statusCode: 400,
      });
    }

    if (reviewType === "trainer") {
      const trainerId = Number(payload.trainerId);
      const bookingId = Number(payload.bookingId);
      const packageActivationId = Number(payload.packageActivationId);

      const booking = await db.Booking.findOne({
        where: {
          id: bookingId,
          memberId: member.id,
          trainerId,
          status: "completed",
        },
        include: [
          {
            model: db.PackageActivation,
            include: [{ model: db.Package, attributes: ["id", "sessions", "gymId"] }],
          },
        ],
      });

      const activation =
        booking?.PackageActivation ||
        (packageActivationId
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
        where: {
          memberId: member.id,
          reviewType,
          trainerId,
          packageActivationId: activation.id,
        },
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

      const trainerRow = await db.Trainer.findByPk(trainerId, {
        attributes: ["userId"],
      });

      if (trainerRow?.userId) {
        realtimeService
          .notifyUser(trainerRow.userId, {
            title: "Bạn có đánh giá mới",
            message: comment.slice(0, 160),
            notificationType: "review",
            relatedType: "review",
            relatedId: row.id,
          })
          .catch((err) => console.warn("notify review trainer failed:", err?.message || err));
      }

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

    if (
      !activation ||
      !(await isActivationCompleted(activation)) ||
      Number(activation.Package?.gymId) !== gymId
    ) {
      throw Object.assign(
        new Error("Bạn chỉ được đánh giá gym khi đã hoàn thành đủ số buổi của một gói thuộc gym đó."),
        { statusCode: 403 }
      );
    }

    const exists = await db.Review.findOne({
      where: {
        memberId: member.id,
        reviewType,
        gymId,
        packageActivationId,
      },
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

    if (gym?.ownerId) {
      realtimeService
        .notifyUser(gym.ownerId, {
          title: "Gym có đánh giá mới",
          message: comment.slice(0, 160),
          notificationType: "review",
          relatedType: "review",
          relatedId: row.id,
        })
        .catch((err) => console.warn("notify review gym failed:", err?.message || err));
    }

    return row;
  },

  async createReview(userId, payload) {
    return this.create(userId, payload);
  },
};

export default reviewService;