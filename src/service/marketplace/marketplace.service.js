import db from "../../models";
import { Op } from "sequelize";

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

const marketplaceService = {
  async listGyms() {
    return db.Gym.findAll({ where: { status: "active" } });
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
      where: { gymId, isActive: true, packageType: "personal_training" },
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
    const trainer = await db.Trainer.findByPk(trainerId, {
      attributes: ["id", "gymId", "isActive"],
    });

    if (!trainer || !trainer.isActive) return [];

    return db.Package.findAll({
      where: {
        gymId: trainer.gymId,
        isActive: true,
        packageType: "personal_training",
      },
    });
  },

  async listPackages({ gymId, q }) {
    const where = { isActive: true, packageType: "personal_training" };

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

  // =========================================================
  // PUBLIC SLOTS for wizard step 3
  // GET /api/marketplace/slots?trainerId=&packageId=&pattern=1,3,5
  //
  // Logic:
  // - chỉ lấy các ngày thuộc pattern
  // - tạo slot 60 phút cho từng ngày
  // - lấy GIAO NHAU giữa các ngày trong pattern
  // - tạm thời check booking theo giờ chung để disable slot nếu bị conflict
  // =========================================================
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

  // 1) Lấy slot cho từng ngày trong pattern
  const daySlotSets = patternDays.map((dayIndex) => {
    const dayKey = DAY_INDEX_TO_KEY[dayIndex];
    const dayRanges = normalizeRanges(availableHours[dayKey]);
    return buildSlotsFromRanges(dayRanges, step);
  });

  if (!daySlotSets.length || daySlotSets.some((set) => set.size === 0)) {
    return [];
  }

  // 2) Giao nhau giữa các ngày trong pattern
  let intersection = [...daySlotSets[0]];
  for (let i = 1; i < daySlotSets.length; i++) {
    intersection = intersection.filter((slotKey) => daySlotSets[i].has(slotKey));
  }

  if (!intersection.length) return [];

  // 3) Step 3 chỉ trả slot "lý thuyết" theo availableHours
  // KHÔNG check booking thực tế ở đây nữa
  return intersection
    .map((slotKey) => {
      const [start, end] = slotKey.split("-");
      return { start, end, ok: true };
    })
    .sort((a, b) => toMin(a.start) - toMin(b.start));
}
};

export default marketplaceService;