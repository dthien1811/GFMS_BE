import db from "../../models";
import { Op, fn, col, literal } from "sequelize";

const toMin = (hhmm) => {
  const s = String(hhmm || "00:00").slice(0, 5);
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

const toHHMM = (mins) => {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
};

const overlap = (aS, aE, bS, bE) => aS < bE && bS < aE;

const DAY_INDEX_TO_KEY = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

const MARKETPLACE_BOOKING_STATUSES = ["confirmed", "completed", "pending"];

const parseJsonSafe = (value, fallback = null) => {
  try {
    if (typeof value === "string") return JSON.parse(value);
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

const normalizeRanges = (ranges) => {
  if (!Array.isArray(ranges)) return [];

  return ranges
    .filter((r) => r?.start && r?.end)
    .map((r) => ({
      start: String(r.start).slice(0, 5),
      end: String(r.end).slice(0, 5),
    }))
    .filter((r) => toMin(r.start) < toMin(r.end));
};

const buildSlotsFromRanges = (ranges, step) => {
  const slotSet = new Set();

  for (const r of ranges) {
    let s = toMin(r.start);
    const end = toMin(r.end);

    while (s + step <= end) {
      const e = s + step;
      slotSet.add(`${toHHMM(s)}-${toHHMM(e)}`);
      s += step;
    }
  }

  return slotSet;
};

const parsePatternDays = (pattern) => {
  return String(pattern || "")
    .split(",")
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && DAY_INDEX_TO_KEY[n]);
};

const normalizeGymRow = (row = {}) => {
  const data = typeof row.toJSON === "function" ? row.toJSON() : row;
  return {
    ...data,
    images: Array.isArray(data.images) ? data.images : parseJsonSafe(data.images, []),
  };
};

const marketplaceService = {
  async listGyms() {
    const rows = await db.Gym.findAll({ where: { status: "active" } });
    return rows.map(normalizeGymRow);
  },

  async getGymDetail(id) {
    const gym = await db.Gym.findByPk(id, {
      include: [{ model: db.User, as: "owner", attributes: ["username", "email"] }],
    });

    if (!gym) return null;

    const data = gym.toJSON();
    data.images = parseJsonSafe(data.images, []);
    if (!Array.isArray(data.images)) data.images = [];

    return data;
  },

  async listGymTrainers(gymId) {
    return db.Trainer.findAll({
      where: { gymId, isActive: true },
      include: [{ model: db.User, attributes: ["username", "avatar"] }],
    });
  },

  async listGymPackages(gymId) {
    return db.Package.findAll({
      where: { gymId, isActive: true },
    });
  },

  async listTrainers({ gymId }) {
    const where = { isActive: true };
    if (gymId) where.gymId = gymId;

    return db.Trainer.findAll({
      where,
      include: [{ model: db.User, attributes: ["id", "username", "avatar"] }],
    });
  },

  async getTrainerDetail(id) {
    return db.Trainer.findByPk(id, {
      include: [{ model: db.User }, { model: db.Gym }],
    });
  },

  async listTrainerPackages(trainerId) {
    return db.Package.findAll({
      where: { trainerId, isActive: true },
    });
  },

  async listPackages({ gymId, q }) {
    const where = { isActive: true };

    if (gymId) where.gymId = gymId;
    if (q) where.name = { [Op.like]: `%${q}%` };

    return db.Package.findAll({
      where,
      include: [{ model: db.Gym, attributes: ["id", "name", "address"] }],
    });
  },

  async getPackageDetail(id) {
    return db.Package.findByPk(id, {
      include: [{ model: db.Gym, attributes: ["id", "name", "address"] }],
    });
  },

  async getLandingHighlights() {
    const [gymRows, trainerRows, packageRows, gymBookings, trainerBookings, packageActivations, gymReviews, trainerReviews, packageReviews] = await Promise.all([
      db.Gym.findAll({ where: { status: "active" } }),
      db.Trainer.findAll({
        where: { isActive: true },
        include: [{ model: db.User, attributes: ["id", "username", "avatar"] }, { model: db.Gym, attributes: ["id", "name", "address"] }],
      }),
      db.Package.findAll({
        where: { isActive: true },
        include: [{ model: db.Gym, attributes: ["id", "name", "address"] }],
      }),
      db.Booking.findAll({
        attributes: ["gymId", [fn("COUNT", col("id")), "bookingCount"]],
        where: { status: { [Op.in]: MARKETPLACE_BOOKING_STATUSES } },
        group: ["gymId"],
        raw: true,
      }),
      db.Booking.findAll({
        attributes: ["trainerId", [fn("COUNT", col("id")), "bookingCount"]],
        where: { trainerId: { [Op.ne]: null }, status: { [Op.in]: MARKETPLACE_BOOKING_STATUSES } },
        group: ["trainerId"],
        raw: true,
      }),
      db.PackageActivation.findAll({
        attributes: ["packageId", [fn("COUNT", col("id")), "purchaseCount"]],
        where: { packageId: { [Op.ne]: null } },
        group: ["packageId"],
        raw: true,
      }),
      db.Review.findAll({
        attributes: ["gymId", [fn("AVG", col("rating")), "avgRating"], [fn("COUNT", col("id")), "reviewCount"]],
        where: { reviewType: "gym", gymId: { [Op.ne]: null }, status: "active" },
        group: ["gymId"],
        raw: true,
      }),
      db.Review.findAll({
        attributes: ["trainerId", [fn("AVG", col("rating")), "avgRating"], [fn("COUNT", col("id")), "reviewCount"]],
        where: { reviewType: "trainer", trainerId: { [Op.ne]: null }, status: "active" },
        group: ["trainerId"],
        raw: true,
      }),
      db.Review.findAll({
        attributes: ["packageId", [fn("AVG", col("rating")), "avgRating"], [fn("COUNT", col("id")), "reviewCount"]],
        where: { reviewType: "package", packageId: { [Op.ne]: null }, status: "active" },
        group: ["packageId"],
        raw: true,
      }),
    ]);

    const gymBookingMap = new Map(gymBookings.map((x) => [Number(x.gymId), Number(x.bookingCount || 0)]));
    const trainerBookingMap = new Map(trainerBookings.map((x) => [Number(x.trainerId), Number(x.bookingCount || 0)]));
    const packageActivationMap = new Map(packageActivations.map((x) => [Number(x.packageId), Number(x.purchaseCount || 0)]));
    const gymReviewMap = new Map(gymReviews.map((x) => [Number(x.gymId), { avgRating: Number(x.avgRating || 0), reviewCount: Number(x.reviewCount || 0) }]));
    const trainerReviewMap = new Map(trainerReviews.map((x) => [Number(x.trainerId), { avgRating: Number(x.avgRating || 0), reviewCount: Number(x.reviewCount || 0) }]));
    const packageReviewMap = new Map(packageReviews.map((x) => [Number(x.packageId), { avgRating: Number(x.avgRating || 0), reviewCount: Number(x.reviewCount || 0) }]));

    const gyms = gymRows
      .map((row) => {
        const gym = normalizeGymRow(row);
        const review = gymReviewMap.get(Number(gym.id)) || { avgRating: 0, reviewCount: 0 };
        const bookingCount = gymBookingMap.get(Number(gym.id)) || 0;
        return {
          ...gym,
          bookingCount,
          avgRating: review.avgRating,
          reviewCount: review.reviewCount,
          popularityScore: bookingCount * 3 + review.reviewCount * 2 + review.avgRating,
        };
      })
      .sort((a, b) => b.popularityScore - a.popularityScore || b.reviewCount - a.reviewCount || String(a.name || "").localeCompare(String(b.name || "")))
      .slice(0, 6);

    const trainers = trainerRows
      .map((row) => {
        const data = typeof row.toJSON === "function" ? row.toJSON() : row;
        const review = trainerReviewMap.get(Number(data.id)) || { avgRating: Number(data.rating || 0), reviewCount: 0 };
        const bookingCount = trainerBookingMap.get(Number(data.id)) || Number(data.totalSessions || 0) || 0;
        return {
          ...data,
          avgRating: review.avgRating || Number(data.rating || 0) || 0,
          reviewCount: review.reviewCount,
          bookingCount,
          popularityScore: bookingCount * 3 + review.reviewCount * 2 + (review.avgRating || 0),
        };
      })
      .sort((a, b) => b.popularityScore - a.popularityScore || b.avgRating - a.avgRating || String(a.User?.username || "").localeCompare(String(b.User?.username || "")))
      .slice(0, 8);

    const packages = packageRows
      .map((row) => {
        const data = typeof row.toJSON === "function" ? row.toJSON() : row;
        const review = packageReviewMap.get(Number(data.id)) || { avgRating: 0, reviewCount: 0 };
        const purchaseCount = packageActivationMap.get(Number(data.id)) || 0;
        return {
          ...data,
          avgRating: review.avgRating,
          reviewCount: review.reviewCount,
          purchaseCount,
          popularityScore: purchaseCount * 3 + review.reviewCount * 2 + review.avgRating,
        };
      })
      .sort((a, b) => b.popularityScore - a.popularityScore || Number(a.price || 0) - Number(b.price || 0) || String(a.name || "").localeCompare(String(b.name || "")))
      .slice(0, 6);

    const totalMembers = await db.Member.count();
    const totalActiveGyms = await db.Gym.count({ where: { status: "active" } });
    const totalActiveTrainers = await db.Trainer.count({ where: { isActive: true } });

    return {
      stats: {
        totalMembers,
        totalActiveGyms,
        totalActiveTrainers,
      },
      gyms,
      trainers,
      packages,
    };
  },

  async getAvailableSlotsPublic({ trainerId, packageId, pattern }) {
    const tId = Number(trainerId);
    const pId = Number(packageId);

    if (!tId || !pId) {
      const err = new Error("trainerId và packageId là bắt buộc");
      err.statusCode = 400;
      throw err;
    }

    const patternDays = parsePatternDays(pattern);
    if (!patternDays.length) {
      const err = new Error("pattern là bắt buộc");
      err.statusCode = 400;
      throw err;
    }

    const trainer = await db.Trainer.findByPk(tId, {
      attributes: ["id", "availableHours", "isActive"],
    });

    if (!trainer || !trainer.isActive) {
      const err = new Error("Trainer không tồn tại hoặc đã bị khóa");
      err.statusCode = 404;
      throw err;
    }

    const pkg = await db.Package.findByPk(pId, {
      attributes: ["id", "isActive"],
    });

    if (!pkg || pkg.isActive === false) {
      const err = new Error("Gói tập không tồn tại hoặc đã ngừng hoạt động");
      err.statusCode = 404;
      throw err;
    }

    let availableHours = parseJsonSafe(trainer.availableHours, {});
    if (!availableHours || typeof availableHours !== "object") {
      availableHours = {};
    }

    const step = 60;

    const daySlotSets = patternDays.map((dayIndex) => {
      const dayKey = DAY_INDEX_TO_KEY[dayIndex];
      const dayRanges = normalizeRanges(availableHours[dayKey]);
      return buildSlotsFromRanges(dayRanges, step);
    });

    if (!daySlotSets.length || daySlotSets.some((set) => set.size === 0)) {
      return [];
    }

    let intersection = [...daySlotSets[0]];
    for (let i = 1; i < daySlotSets.length; i++) {
      intersection = intersection.filter((slotKey) => daySlotSets[i].has(slotKey));
    }

    if (!intersection.length) return [];

    return intersection
      .map((slotKey) => {
        const [start, end] = slotKey.split("-");
        return { start, end, ok: true };
      })
      .sort((a, b) => toMin(a.start) - toMin(b.start));
  }
};

export default marketplaceService;
