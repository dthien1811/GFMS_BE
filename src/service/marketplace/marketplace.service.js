import db from "../../models";
import { Op, fn, col } from "sequelize";

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

const DAY_INDEX_TO_KEY = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

const DAY_LABEL = {
  monday: "Thứ 2",
  tuesday: "Thứ 3",
  wednesday: "Thứ 4",
  thursday: "Thứ 5",
  friday: "Thứ 6",
  saturday: "Thứ 7",
  sunday: "Chủ nhật",
};

const MARKETPLACE_BOOKING_STATUSES = ["confirmed", "completed", "pending"];
const ACTIVE_PACKAGE_STATUS = ["active", "ACTIVE"];
const ACTIVE_PACKAGE_WHERE = {
  isActive: true,
  [Op.or]: [{ status: { [Op.in]: ACTIVE_PACKAGE_STATUS } }, { status: null }],
};

const parseJsonSafe = (value, fallback = null) => {
  try {
    if (typeof value === "string") return JSON.parse(value);
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

const parseBoolFlag = (value) => {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
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

const paginate = ({ page, limit }) => {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(24, Math.max(1, Number(limit) || 9));
  return { page: p, limit: l, offset: (p - 1) * l };
};

const formatOperatingHours = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return formatOperatingHours(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }
  if (Array.isArray(value)) {
    return value.map(formatOperatingHours).filter(Boolean).join(" • ");
  }
  if (typeof value !== "object") return String(value);

  const keys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const parts = keys
    .map((key) => {
      const ranges = normalizeRanges(value[key]);
      if (!ranges.length) return null;
      return `${DAY_LABEL[key]}: ${ranges.map((r) => `${r.start}-${r.end}`).join(", ")}`;
    })
    .filter(Boolean);

  if (!parts.length) {
    if (value.open && value.close) return `${String(value.open).slice(0,5)}-${String(value.close).slice(0,5)}`;
    return null;
  }

  const allSame = parts.every((part) => part.split(": ")[1] === parts[0].split(": ")[1]);
  if (allSame) return `T2-CN: ${parts[0].split(": ")[1]}`;
  return parts.join(" • ");
};

const normalizeGymRow = (row = {}) => {
  const data = typeof row.toJSON === "function" ? row.toJSON() : row;
  const operatingHoursRaw = parseJsonSafe(data.operatingHours, data.operatingHours);
  return {
    ...data,
    images: Array.isArray(data.images) ? data.images : parseJsonSafe(data.images, []),
    operatingHoursRaw,
    operatingHours: formatOperatingHours(operatingHoursRaw),
  };
};



const buildReviewAggregateMap = (rows = [], keyField) => {
  return new Map(
    rows
      .filter((x) => x && x[keyField] != null)
      .map((x) => [
        Number(x[keyField]),
        {
          avgRating: Number(x.avgRating || 0),
          reviewCount: Number(x.reviewCount || 0),
        },
      ])
  );
};

const buildCountMap = (rows = [], keyField, valueField) => {
  return new Map(
    rows
      .filter((x) => x && x[keyField] != null)
      .map((x) => [Number(x[keyField]), Number(x[valueField] || 0)])
  );
};

const formatSessionLabel = (booking) => {
  if (!booking?.bookingDate) return "";
  const date = new Date(booking.bookingDate);
  const dateText = Number.isNaN(date.getTime())
    ? String(booking.bookingDate)
    : date.toLocaleDateString("vi-VN");
  const start = booking?.startTime ? String(booking.startTime).slice(0, 5) : "";
  const end = booking?.endTime ? String(booking.endTime).slice(0, 5) : "";
  return start && end ? `${dateText} • ${start}-${end}` : dateText;
};

async function listPublicReviews({ reviewType = null, gymId = null, trainerId = null, packageId = null, packageIds = null, limit = 6, prioritizeFiveStar = false }) {
  const where = {
    status: "active",
    comment: { [Op.ne]: null },
    ...(reviewType ? { reviewType } : {}),
    ...(gymId ? { gymId } : {}),
    ...(trainerId ? { trainerId } : {}),
    ...(packageId ? { packageId } : {}),
    ...(Array.isArray(packageIds) && packageIds.length ? { packageId: { [Op.in]: packageIds } } : {}),
  };

  const rows = await db.Review.findAll({
    where,
    include: [
      {
        model: db.Member,
        attributes: ["id"],
        include: [{ model: db.User, attributes: ["username", "avatar"] }],
      },
      {
        model: db.Booking,
        attributes: ["id", "bookingDate", "startTime", "endTime"],
        required: false,
      },
      {
        model: db.Trainer,
        attributes: ["id"],
        required: false,
        include: [{ model: db.User, attributes: ["username"] }],
      },
      { model: db.Gym, attributes: ["id", "name"], required: false },
      { model: db.Package, attributes: ["id", "name", "gymId"], required: false },
    ],
    order: [["createdAt", "DESC"]],
    limit: Math.max(limit * 3, limit),
  });

  const mapped = rows
    .map((row) => {
      const data = typeof row.toJSON === "function" ? row.toJSON() : row;
      const comment = String(data.comment || "").trim();
      if (!comment) return null;

      let subjectName = "";
      let reviewTypeLabel = "";

      if (data.reviewType === "trainer") {
        subjectName = data.Trainer?.User?.username || "PT";
        reviewTypeLabel = "PT";
      } else if (data.reviewType === "gym") {
        subjectName = data.Gym?.name || "Phòng gym";
        reviewTypeLabel = "Gym";
      } else if (data.reviewType === "package") {
        subjectName = data.Package?.name || "Gói tập";
        reviewTypeLabel = "Gói tập";
      }

      return {
        id: data.id,
        reviewType: data.reviewType,
        rating: Number(data.rating || 0),
        comment,
        createdAt: data.createdAt,
        memberName: data.Member?.User?.username || "Thành viên GFMS",
        memberAvatar: data.Member?.User?.avatar || "",
        subjectName,
        reviewTypeLabel,
        sessionLabel: formatSessionLabel(data.Booking),
        gymId: data.gymId || data.Package?.gymId || null,
        trainerId: data.trainerId || null,
        packageId: data.packageId || null,
      };
    })
    .filter(Boolean);

  mapped.sort((a, b) => {
    if (prioritizeFiveStar && Number(b.rating || 0) !== Number(a.rating || 0)) {
      return Number(b.rating || 0) - Number(a.rating || 0);
    }
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  return mapped.slice(0, limit);
}

const marketplaceService = {
  async listGyms(query = {}) {
    const { q, page, limit } = query;
    const lite = parseBoolFlag(query?.lite);
    const pg = paginate({ page, limit });
    const where = {};
    if (q) {
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { address: { [Op.like]: `%${q}%` } },
        { description: { [Op.like]: `%${q}%` } },
      ];
    }

    const { rows, count } = await db.Gym.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      offset: pg.offset,
      limit: pg.limit,
    });

    if (lite) {
      return {
        items: rows.map((row) => normalizeGymRow(row)),
        pagination: {
          page: pg.page,
          limit: pg.limit,
          total: count,
          totalPages: Math.max(1, Math.ceil(count / pg.limit)),
        },
      };
    }

    const gymIds = rows.map((x) => Number(x.id)).filter(Boolean);
    const [gymReviews, gymBookings] = await Promise.all([
      gymIds.length
        ? db.Review.findAll({
            attributes: ["gymId", [fn("AVG", col("rating")), "avgRating"], [fn("COUNT", col("id")), "reviewCount"]],
            where: { reviewType: "gym", gymId: { [Op.in]: gymIds }, status: "active" },
            group: ["gymId"],
            raw: true,
          })
        : Promise.resolve([]),
      gymIds.length
        ? db.Booking.findAll({
            attributes: ["gymId", [fn("COUNT", col("id")), "bookingCount"]],
            where: { gymId: { [Op.in]: gymIds }, status: { [Op.in]: MARKETPLACE_BOOKING_STATUSES } },
            group: ["gymId"],
            raw: true,
          })
        : Promise.resolve([]),
    ]);

    const reviewMap = buildReviewAggregateMap(gymReviews, "gymId");
    const bookingMap = buildCountMap(gymBookings, "gymId", "bookingCount");

    return {
      items: rows.map((row) => {
        const gym = normalizeGymRow(row);
        const review = reviewMap.get(Number(gym.id)) || { avgRating: 0, reviewCount: 0 };
        return {
          ...gym,
          avgRating: review.avgRating,
          reviewCount: review.reviewCount,
          bookingCount: bookingMap.get(Number(gym.id)) || 0,
        };
      }),
      pagination: {
        page: pg.page,
        limit: pg.limit,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / pg.limit)),
      },
    };
  },

  async getGymDetail(id, query = {}) {
    const lite = parseBoolFlag(query?.lite);
    const gym = await db.Gym.findByPk(id, {
      include: [{ model: db.User, as: "owner", attributes: ["username", "email"] }],
    });

    if (!gym) return null;
    const data = normalizeGymRow(gym);
    if (lite) {
      return data;
    }
    const [gymReviewRow, gymBookingRow] = await Promise.all([
      db.Review.findOne({
        attributes: [[fn("AVG", col("rating")), "avgRating"], [fn("COUNT", col("id")), "reviewCount"]],
        where: { reviewType: "gym", gymId: Number(id), status: "active" },
        raw: true,
      }),
      db.Booking.findOne({
        attributes: [[fn("COUNT", col("id")), "bookingCount"]],
        where: { gymId: Number(id), status: { [Op.in]: MARKETPLACE_BOOKING_STATUSES } },
        raw: true,
      }),
    ]);
    data.avgRating = Number(gymReviewRow?.avgRating || 0);
    data.reviewCount = Number(gymReviewRow?.reviewCount || 0);
    data.bookingCount = Number(gymBookingRow?.bookingCount || 0);
    data.feedback = await listPublicReviews({ reviewType: "gym", gymId: Number(id), limit: 6 });
    if (!data.feedback.length) {
      const packageIds = await db.Package.findAll({ where: { gymId: Number(id), isActive: true }, attributes: ["id"], raw: true });
      const ids = packageIds.map((x) => Number(x.id)).filter(Boolean);
      if (ids.length) {
        data.feedback = await listPublicReviews({ reviewType: "package", packageIds: ids, limit: 6 });
      }
    }
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
      where: { gymId, packageType: "personal_training", ...ACTIVE_PACKAGE_WHERE },
    });
  },

  async listTrainers({ gymId, q, page, limit, lite } = {}) {
    const where = { isActive: true };
    const userWhere = {};
    if (gymId) where.gymId = gymId;
    if (q) {
      userWhere.username = { [Op.like]: `%${q}%` };
      where[Op.or] = [
        { specialization: { [Op.like]: `%${q}%` } },
        { bio: { [Op.like]: `%${q}%` } },
      ];
    }
    const pg = paginate({ page, limit });

    const { rows, count } = await db.Trainer.findAndCountAll({
      where,
      include: [{ model: db.User, attributes: ["id", "username", "avatar"], ...(q ? { where: userWhere, required: false } : {}) }, { model: db.Gym, attributes: ["id", "name", "address"] }],
      order: [["createdAt", "DESC"]],
      offset: pg.offset,
      limit: pg.limit,
      distinct: true,
    });

    const items = rows.filter((row) => {
      if (!q) return true;
      const data = typeof row.toJSON === "function" ? row.toJSON() : row;
      const haystack = `${data.User?.username || ""} ${data.specialization || ""} ${data.bio || ""}`.toLowerCase();
      return haystack.includes(String(q).toLowerCase());
    });

    if (parseBoolFlag(lite)) {
      return {
        items,
        pagination: {
          page: pg.page,
          limit: pg.limit,
          total: count,
          totalPages: Math.max(1, Math.ceil(count / pg.limit)),
        },
      };
    }

    const trainerIds = items.map((x) => Number(x.id)).filter(Boolean);
    const [trainerReviews, trainerStudents, trainerPackages] = await Promise.all([
      trainerIds.length
        ? db.Review.findAll({
            attributes: ["trainerId", [fn("AVG", col("rating")), "avgRating"], [fn("COUNT", col("id")), "reviewCount"]],
            where: { reviewType: "trainer", trainerId: { [Op.in]: trainerIds }, status: "active" },
            group: ["trainerId"],
            raw: true,
          })
        : Promise.resolve([]),
      trainerIds.length
        ? db.Booking.findAll({
            attributes: ["trainerId", [fn("COUNT", fn("DISTINCT", col("memberId"))), "studentsCount"]],
            where: { trainerId: { [Op.in]: trainerIds }, status: { [Op.in]: MARKETPLACE_BOOKING_STATUSES } },
            group: ["trainerId"],
            raw: true,
          })
        : Promise.resolve([]),
      trainerIds.length
        ? db.Package.findAll({
            attributes: ["trainerId", [fn("COUNT", col("id")), "packageCount"]],
            where: { trainerId: { [Op.in]: trainerIds }, isActive: true },
            group: ["trainerId"],
            raw: true,
          })
        : Promise.resolve([]),
    ]);

    const reviewMap = buildReviewAggregateMap(trainerReviews, "trainerId");
    const studentMap = buildCountMap(trainerStudents, "trainerId", "studentsCount");
    const packageMap = buildCountMap(trainerPackages, "trainerId", "packageCount");

    return {
      items: items.map((row) => {
        const data = typeof row.toJSON === "function" ? row.toJSON() : row;
        const review = reviewMap.get(Number(data.id)) || { avgRating: 0, reviewCount: 0 };
        return {
          ...data,
          avgRating: review.avgRating,
          reviewCount: review.reviewCount,
          studentsCount: studentMap.get(Number(data.id)) || 0,
          clientsCount: studentMap.get(Number(data.id)) || 0,
          packageCount: packageMap.get(Number(data.id)) || 0,
        };
      }),
      pagination: {
        page: pg.page,
        limit: pg.limit,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / pg.limit)),
      },
    };
  },

  async getTrainerDetail(id) {
    const trainer = await db.Trainer.findByPk(id, {
      include: [{ model: db.User }, { model: db.Gym }],
    });
    if (!trainer || trainer.isActive === false || trainer.isActive === 0) return null;
    const data = typeof trainer.toJSON === "function" ? trainer.toJSON() : trainer;
    const [trainerReviewRow, trainerStudentRow, trainerPackageRow] = await Promise.all([
      db.Review.findOne({
        attributes: [[fn("AVG", col("rating")), "avgRating"], [fn("COUNT", col("id")), "reviewCount"]],
        where: { reviewType: "trainer", trainerId: Number(id), status: "active" },
        raw: true,
      }),
      db.Booking.findOne({
        attributes: [[fn("COUNT", fn("DISTINCT", col("memberId"))), "studentsCount"]],
        where: { trainerId: Number(id), status: { [Op.in]: MARKETPLACE_BOOKING_STATUSES } },
        raw: true,
      }),
      db.Package.findOne({
        attributes: [[fn("COUNT", col("id")), "packageCount"]],
        where: { trainerId: Number(id), isActive: true },
        raw: true,
      }),
    ]);
    data.avgRating = Number(trainerReviewRow?.avgRating || 0);
    data.reviewCount = Number(trainerReviewRow?.reviewCount || 0);
    data.studentsCount = Number(trainerStudentRow?.studentsCount || 0);
    data.clientsCount = data.studentsCount;
    data.packageCount = Number(trainerPackageRow?.packageCount || 0);
    data.feedback = await listPublicReviews({ reviewType: "trainer", trainerId: Number(id), limit: 6 });
    return data;
  },

  async listTrainerPackages(trainerId) {
    const trainer = await db.Trainer.findByPk(trainerId, {
      attributes: ["id", "gymId", "isActive"],
    });

    if (!trainer || !trainer.isActive) return [];

    return db.Package.findAll({
      where: {
        gymId: trainer.gymId,
        ...ACTIVE_PACKAGE_WHERE,
        packageType: "personal_training",
      },
    });
  },

  async listPackages({ gymId, q, page, limit, lite } = {}) {
    const where = { packageType: "personal_training", ...ACTIVE_PACKAGE_WHERE };

    if (gymId) where.gymId = gymId;
    if (q) where.name = { [Op.like]: `%${q}%` };
    const pg = paginate({ page, limit });

    const { rows, count } = await db.Package.findAndCountAll({
      where,
      include: [{ model: db.Gym, attributes: ["id", "name", "address"] }],
      order: [["createdAt", "DESC"]],
      offset: pg.offset,
      limit: pg.limit,
      distinct: true,
    });

    if (parseBoolFlag(lite)) {
      return {
        items: rows,
        pagination: {
          page: pg.page,
          limit: pg.limit,
          total: count,
          totalPages: Math.max(1, Math.ceil(count / pg.limit)),
        },
      };
    }

    return {
      items: rows,
      pagination: {
        page: pg.page,
        limit: pg.limit,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / pg.limit)),
      },
    };
  },

  async getPackageDetail(id) {
    return db.Package.findOne({
      where: { id, ...ACTIVE_PACKAGE_WHERE },
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
        where: ACTIVE_PACKAGE_WHERE,
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
        return { ...gym, bookingCount, avgRating: review.avgRating, reviewCount: review.reviewCount, popularityScore: bookingCount * 3 + review.reviewCount * 2 + review.avgRating };
      })
      .sort((a, b) => b.popularityScore - a.popularityScore || b.reviewCount - a.reviewCount || String(a.name || "").localeCompare(String(b.name || "")))
      .slice(0, 6);

    const trainers = trainerRows
      .map((row) => {
        const data = typeof row.toJSON === "function" ? row.toJSON() : row;
        const review = trainerReviewMap.get(Number(data.id)) || { avgRating: Number(data.rating || 0), reviewCount: 0 };
        const bookingCount = trainerBookingMap.get(Number(data.id)) || Number(data.totalSessions || 0) || 0;
        return { ...data, avgRating: review.avgRating || Number(data.rating || 0) || 0, reviewCount: review.reviewCount, bookingCount, popularityScore: bookingCount * 3 + review.reviewCount * 2 + (review.avgRating || 0) };
      })
      .sort((a, b) => b.popularityScore - a.popularityScore || b.avgRating - a.avgRating || String(a.User?.username || "").localeCompare(String(b.User?.username || "")))
      .slice(0, 8);

    const packages = packageRows
      .map((row) => {
        const data = typeof row.toJSON === "function" ? row.toJSON() : row;
        const review = packageReviewMap.get(Number(data.id)) || { avgRating: 0, reviewCount: 0 };
        const purchaseCount = packageActivationMap.get(Number(data.id)) || 0;
        return { ...data, avgRating: review.avgRating, reviewCount: review.reviewCount, purchaseCount, popularityScore: purchaseCount * 3 + review.reviewCount * 2 + review.avgRating };
      })
      .sort((a, b) => b.popularityScore - a.popularityScore || Number(a.price || 0) - Number(b.price || 0) || String(a.name || "").localeCompare(String(b.name || "")))
      .slice(0, 6);

    const testimonials = await listPublicReviews({ limit: 8, prioritizeFiveStar: true });

    const totalMembers = await db.Member.count();
    const totalActiveGyms = await db.Gym.count({ where: { status: "active" } });
    const totalActiveTrainers = await db.Trainer.count({ where: { isActive: true } });

    return { stats: { totalMembers, totalActiveGyms, totalActiveTrainers }, gyms, trainers, packages, testimonials };
  },

  async listPublicReviews(params = {}) {
    const reviewType = String(params.reviewType || "").toLowerCase();
    const normalizedType = ["gym", "trainer", "package"].includes(reviewType) ? reviewType : null;
    return listPublicReviews({
      reviewType: normalizedType,
      gymId: Number(params.gymId) || null,
      trainerId: Number(params.trainerId) || null,
      packageId: Number(params.packageId) || null,
      limit: Math.min(12, Math.max(1, Number(params.limit) || 6)),
      prioritizeFiveStar: params.prioritizeFiveStar === true || String(params.prioritizeFiveStar || "").toLowerCase() === "true",
    });
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
      attributes: ["id", "isActive", "status"],
    });

    const pkgStatus = String(pkg?.status || "").trim().toLowerCase();
    if (!pkg || pkg.isActive === false || (pkgStatus && pkgStatus !== "active")) {
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
    for (let i = 1; i < daySlotSets.length; i += 1) {
      intersection = intersection.filter((slot) => daySlotSets[i].has(slot));
    }

    return intersection.sort((a, b) => toMin(a.split("-")[0]) - toMin(b.split("-")[0]));
  },
};

export default marketplaceService;
