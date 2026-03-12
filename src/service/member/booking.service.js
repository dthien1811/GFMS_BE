// src/service/member/booking.service.js
import db from "../../models";
import { Op } from "sequelize";

const SLOT_MINUTES = 60;
const OWNER_COMMISSION_RATE = 0.15;

/* ================= DEBUG HELPERS ================= */
const dbg = (...args) => console.log("[BOOKING_SVC]", ...args);
const localTodayKey = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local

/* ================= TIME UTILS ================= */
const timeToMinutes = (t) => {
  const s = String(t || "").slice(0, 5); // HH:mm
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

const minutesToTime = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;

const assertDateOnly = (d) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const e = new Error("Date must be YYYY-MM-DD");
    e.statusCode = 400;
    throw e;
  }
};

const safeParseJSON = (v, fallback) => {
  try {
    if (!v) return fallback;
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return fallback;
  }
};

/* ================= DATA HELPERS ================= */
async function getGymCommissionRate(gymId, transaction) {
  const policy = await db.Policy.findOne({
    where: {
      policyType: "commission",
      appliesTo: "gym",
      gymId,
      isActive: true,
    },
    order: [["createdAt", "DESC"]],
    transaction,
  });

  const value = safeParseJSON(policy?.value, {});
  const ownerRate = Number(value?.ownerRate ?? OWNER_COMMISSION_RATE);
  if (Number.isNaN(ownerRate) || ownerRate < 0 || ownerRate > 1) return OWNER_COMMISSION_RATE;
  return ownerRate;
}

/* ================= BUSINESS RULE ================= */
function trainerMatchPackage(trainer, pkg) {
  if (!pkg?.type || pkg.type === "basic") return true;
  if (!trainer.specialization) return false;

  const specs = Array.isArray(trainer.specialization)
    ? trainer.specialization
    : String(trainer.specialization).split(",").map((s) => s.trim().toLowerCase());

  return specs.includes(String(pkg.type).trim().toLowerCase());
}

/* ================= CORE ================= */
async function getActivationOrThrow(userId, activationId, t) {
  if (!activationId) {
    const e = new Error("Thiếu activationId");
    e.statusCode = 400;
    throw e;
  }

  const activation = await db.PackageActivation.findByPk(activationId, {
    include: [
      { model: db.Member, attributes: ["id", "userId", "gymId"] },
      { model: db.Package, attributes: ["id", "name", "type", "price", "sessions"] },
    ],
    transaction: t,
    lock: t ? t.LOCK.UPDATE : undefined,
  });

  if (!activation) {
    const e = new Error("Không tìm thấy gói đã mua");
    e.statusCode = 404;
    throw e;
  }

  if (Number(activation.Member.userId) !== Number(userId)) {
    const e = new Error("Gói tập không thuộc về bạn");
    e.statusCode = 403;
    throw e;
  }

  if (activation.status !== "active") {
    const e = new Error("Gói tập không active");
    e.statusCode = 400;
    throw e;
  }

  return activation;
}

async function countBookedNotCancelled(activationId, transaction) {
  // Các booking đã “chiếm suất” của gói: pending/confirmed/in_progress/completed/no_show…
  // Chỉ bỏ cancelled.
  return db.Booking.count({
    where: {
      packageActivationId: activationId,
      status: { [Op.ne]: "cancelled" },
    },
    transaction,
  });
}

/* ================= SERVICE ================= */
const bookingService = {
  /* ===== GET AVAILABLE TRAINERS ===== */
  async getAvailableTrainers(userId, activationId) {
    const activation = await getActivationOrThrow(userId, activationId);
    const { gymId } = activation.Member;
    const pkg = activation.Package;

    const trainers = await db.Trainer.findAll({
      where: { gymId, isActive: true },
      attributes: ["id", "specialization", "rating", "totalSessions", "availableHours"],
      include: [{ model: db.User, attributes: ["username"] }],
    });

    return {
      package: {
        id: pkg.id,
        name: pkg.name,
        type: pkg.type,
        // NOTE: không tin sessionsRemaining nữa để hiển thị
      },
      trainers: trainers.filter((t) => trainerMatchPackage(t, pkg)),
    };
  },

  /* ===== GET AVAILABLE SLOTS ===== */
  async getAvailableSlots(userId, { trainerId, date, activationId }) {
    assertDateOnly(date);
    const activation = await getActivationOrThrow(userId, activationId);
    const gymId = activation.Member.gymId;

    const trainer = await db.Trainer.findOne({
      where: { id: trainerId, gymId, isActive: true },
    });

    if (!trainer || !trainerMatchPackage(trainer, activation.Package)) {
      const e = new Error("Trainer không phù hợp gói tập");
      e.statusCode = 400;
      throw e;
    }

    const dayKey = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
      new Date(`${date}T00:00:00`).getDay()
    ];

    const hours = trainer.availableHours?.[dayKey] || [];
    if (!hours.length) return [];

    const bookings = await db.Booking.findAll({
      where: {
        trainerId,
        gymId,
        bookingDate: date,
        status: { [Op.notIn]: ["cancelled"] },
      },
    });

    const busy = bookings.map((b) => ({
      s: timeToMinutes(b.startTime),
      e: timeToMinutes(b.endTime),
    }));

    const now = new Date();
    const todayLocal = localTodayKey();
    const isToday = date === todayLocal;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    dbg("getAvailableSlots date=", date, "todayLocal=", todayLocal, "isToday=", isToday);

    const slots = [];
    for (const h of hours) {
      let s = timeToMinutes(h.start);
      const end = timeToMinutes(h.end);

      while (s + SLOT_MINUTES <= end) {
        const e = s + SLOT_MINUTES;

        if (isToday && s <= nowMinutes) {
          s += SLOT_MINUTES;
          continue;
        }

        const isBusy = busy.some((b) => b.s < e && b.e > s);
        if (!isBusy) {
          slots.push({ startTime: minutesToTime(s), endTime: minutesToTime(e) });
        }
        s += SLOT_MINUTES;
      }
    }
    return slots;
  },

  /* ===== CREATE BOOKING ===== */
  async createBooking(userId, { activationId, trainerId, date, startTime }) {
    const t = await db.sequelize.transaction();
    try {
      assertDateOnly(date);

      const activation = await getActivationOrThrow(userId, activationId, t);
      const gymId = activation.Member.gymId;

      // ✅ normalize startTime -> HH:mm:ss
      const st = String(startTime || "");
      const startTimeFixed = st.length === 5 ? `${st}:00` : st;

      dbg("createBooking payload=", { activationId, trainerId, date, startTime, startTimeFixed });

      // ✅ LIMIT theo tổng số buổi gói (không trừ khi create booking)
      const total =
        Number(activation.totalSessions ?? activation.Package?.sessions ?? 0) || 0;

      if (total <= 0) {
        const e = new Error("Gói không có tổng số buổi hợp lệ");
        e.statusCode = 400;
        throw e;
      }

      const bookedCnt = await countBookedNotCancelled(activation.id, t);
      dbg("createBooking bookedCnt=", bookedCnt, "total=", total);

      if (bookedCnt >= total) {
        const e = new Error("Bạn đã đặt đủ số buổi của gói. Hãy huỷ 1 buổi hoặc mua gói mới.");
        e.statusCode = 400;
        throw e;
      }

      // ✅ quá khứ
      const bookingDateTime = new Date(`${date}T${startTimeFixed}`);
      if (bookingDateTime <= new Date()) {
        const e = new Error("Không thể đặt lịch trong quá khứ");
        e.statusCode = 400;
        throw e;
      }

      const sMin = timeToMinutes(startTimeFixed);
      const eMin = sMin + SLOT_MINUTES;
      const endTime = minutesToTime(eMin);

      // ✅ conflict check
      const conflict = await db.Booking.findOne({
        where: {
          trainerId,
          gymId,
          bookingDate: date,
          status: { [Op.notIn]: ["cancelled"] },
          [Op.and]: [
            { startTime: { [Op.lt]: endTime } },
            { endTime: { [Op.gt]: startTimeFixed } },
          ],
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (conflict) {
        const e = new Error("Khung giờ đã được đặt");
        e.statusCode = 409;
        throw e;
      }

      const booking = await db.Booking.create(
        {
          memberId: activation.memberId,
          trainerId,
          gymId,
          packageId: activation.packageId,
          packageActivationId: activation.id,
          bookingDate: date,         // DATEONLY
          startTime: startTimeFixed, // TIME
          endTime,                   // TIME
          status: "confirmed",
          createdBy: userId,
        },
        { transaction: t }
      );

      // ❌ KHÔNG decrement sessionsRemaining ở đây nữa
      await t.commit();

      dbg("createBooking OK booking.id=", booking?.id, "bookingDate=", booking?.bookingDate, "startTime=", booking?.startTime);
      return booking;
    } catch (e) {
      await t.rollback();
      dbg("createBooking ERROR:", e.message);
      throw e;
    }
  },

  /* ===== GET MY BOOKINGS ===== */
  async getMyBookings(userId) {
    dbg("TZ:", Intl.DateTimeFormat().resolvedOptions().timeZone);
    dbg("serverNow:", new Date().toISOString(), "| local:", new Date().toString(), "| localKey:", localTodayKey());

    const rows = await db.Booking.findAll({
      where: { createdBy: userId },
      include: [
        { model: db.Trainer, include: [{ model: db.User, attributes: ["username"] }] },
        { model: db.Package, attributes: ["name", "type"] },
        { model: db.Gym, attributes: ["name"] },
      ],
      order: [["bookingDate", "ASC"], ["startTime", "ASC"]],
    });

    const s0 = rows?.[0];
    dbg("sample bookingDate raw:", s0?.bookingDate, "typeof:", typeof s0?.bookingDate);
    dbg("sample start/end:", s0?.startTime, s0?.endTime);
    dbg("JSON sample (first 2):", JSON.stringify(rows?.slice(0, 2), null, 2));

    return rows;
  },

  /* ===== CANCEL / CHECKIN / CHECKOUT ===== */
  // giữ nguyên phần khác của bạn (nếu có)
};

export default bookingService;