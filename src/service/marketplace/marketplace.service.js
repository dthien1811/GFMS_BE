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
    try {
      data.images = data.images ? JSON.parse(data.images) : [];
    } catch {
      data.images = [];
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

  // =========================================================
  // ✅ PUBLIC SLOTS (wizard step 3)
  // GET /api/marketplace/slots?trainerId=&packageId=
  // Each slot = 60 minutes
  // return: [{start:"09:00", end:"10:00", ok:true}, ...]
  // =========================================================
  async getAvailableSlotsPublic({ trainerId, packageId }) {
    const tId = Number(trainerId);
    const pId = Number(packageId);

    if (!tId || !pId) {
      const err = new Error("Invalid params: trainerId, packageId are required");
      err.statusCode = 400;
      throw err;
    }

    // ✅ Trainer model của bạn: availableHours (JSON)
    const trainer = await db.Trainer.findByPk(tId, {
      attributes: ["id", "availableHours", "isActive"],
    });

    if (!trainer || !trainer.isActive) {
      const err = new Error("Trainer not found or inactive");
      err.statusCode = 404;
      throw err;
    }

    // parse availableHours (có thể là object hoặc string JSON)
    let hours = trainer.availableHours;
    try {
      if (typeof hours === "string") hours = JSON.parse(hours);
    } catch {
      hours = null;
    }
    if (!hours || typeof hours !== "object") return [];

    // ✅ slot 60 phút
    const step = 60;

    // 1) gom tất cả range trong tuần (monday..sunday)
    const allRanges = [];
    for (const dayKey of Object.keys(hours)) {
      const ranges = Array.isArray(hours[dayKey]) ? hours[dayKey] : [];
      for (const r of ranges) {
        if (r?.start && r?.end) allRanges.push({ start: r.start, end: r.end });
      }
    }
    if (!allRanges.length) return [];

    // 2) booking để đánh ok=false (bất kỳ ngày nào)
    // booking table bạn có: bookingDate/startTime/endTime/status/trainerId
    let bookings = [];
    if (db.Booking) {
      bookings = await db.Booking.findAll({
        where: {
          trainerId: tId,
          status: { [Op.in]: ["confirmed", "completed", "pending"] },
        },
        attributes: ["startTime", "endTime"],
        limit: 5000,
      });
    }

    const booked = bookings.map((b) => ({
      s: toMin(b.startTime),
      e: toMin(b.endTime),
    }));

    // 3) generate slots union + unique
    const map = new Map(); // key = "HH:MM-HH:MM"
    for (const r of allRanges) {
      let s = toMin(r.start);
      const end = toMin(r.end);

      while (s + step <= end) {
        const e = s + step;
        const startStr = toHHMM(s);
        const endStr = toHHMM(e);
        const key = `${startStr}-${endStr}`;

        const ok = !booked.some((b) => overlap(s, e, b.s, b.e));

        if (!map.has(key)) {
          map.set(key, { start: startStr, end: endStr, ok });
        } else {
          // đã có slot: nếu 1 lần nào đó bị trùng booking => ok=false
          const cur = map.get(key);
          if (cur.ok && !ok) map.set(key, { ...cur, ok: false });
        }

        s += step;
      }
    }

    // sort theo giờ bắt đầu
    return Array.from(map.values()).sort((a, b) => toMin(a.start) - toMin(b.start));
  },
};

export default marketplaceService;