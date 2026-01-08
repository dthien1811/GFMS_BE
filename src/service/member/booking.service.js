import db from "../../models";
import { Op } from "sequelize";

const SLOT_MINUTES = 60;

// ===== Time helpers =====
function parseHHMM(timeStr) {
  const s = String(timeStr || "").trim();
  const parts = s.split(":");
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) throw new Error("Invalid time");
  return { hh, mm };
}

function timeToMinutes(timeStr) {
  const { hh, mm } = parseHHMM(timeStr);
  return hh * 60 + mm;
}

function minutesToTime(min) {
  const hh = String(Math.floor(min / 60)).padStart(2, "0");
  const mm = String(min % 60).padStart(2, "0");
  return `${hh}:${mm}:00`;
}

function isSlotAligned(startTime) {
  const { mm } = parseHHMM(startTime);
  return mm % SLOT_MINUTES === 0;
}

// ===== Date helpers (local) =====
function assertDateOnly(dateStr) {
  const s = String(dateStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const err = new Error("Invalid date. Use YYYY-MM-DD.");
    err.statusCode = 400;
    throw err;
  }
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    const err = new Error("Invalid date. Use YYYY-MM-DD.");
    err.statusCode = 400;
    throw err;
  }
  return s;
}

function toDateObj(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

function getLocalTodayStr() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function nowMinutesLocal() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function safeParseJSON(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// ===== Data helpers =====
async function getMemberByUserId(userId) {
  return db.Member.findOne({ where: { userId } });
}

async function getActivePackageActivation(memberId) {
  return db.PackageActivation.findOne({
    where: {
      memberId,
      status: "active",
      sessionsRemaining: { [Op.gt]: 0 },
      [Op.or]: [{ expiryDate: null }, { expiryDate: { [Op.gte]: new Date() } }],
    },
    order: [["createdAt", "DESC"]],
  });
}

async function assertTrainerShareToGym({ trainerId, gymId, bookingDateObj }) {
  const share = await db.TrainerShare.findOne({
    where: {
      trainerId,
      toGymId: gymId,
      status: "approved",
      startDate: { [Op.lte]: bookingDateObj },
      endDate: { [Op.gte]: bookingDateObj },
    },
  });

  if (!share) {
    const err = new Error("Trainer không được share vào gym này (TrainerShare-only).");
    err.statusCode = 403;
    throw err;
  }

  return share;
}

function assertNotPastBooking(bookingDateStr, startTime) {
  const todayStr = getLocalTodayStr();

  if (bookingDateStr < todayStr) {
    const err = new Error("Không thể đặt lịch trong quá khứ.");
    err.statusCode = 400;
    throw err;
  }

  // nếu là hôm nay, chặn đặt slot đã qua
  if (bookingDateStr === todayStr) {
    const startMin = timeToMinutes(startTime);
    const nowMin = nowMinutesLocal();
    if (startMin <= nowMin) {
      const err = new Error("Khung giờ này đã qua. Vui lòng chọn giờ khác.");
      err.statusCode = 400;
      throw err;
    }
  }
}

async function assertNoOverlapLocked({ trainerId, gymId, bookingDateStr, startMin, endMin, transaction }) {
  // ✅ Không dùng TIME literal nữa; so sánh bằng minutes ở JS
  // Lấy tất cả booking cùng ngày của trainer để check overlap (có lock)
  const existing = await db.Booking.findAll({
    where: {
      trainerId,
      gymId,
      bookingDate: bookingDateStr,
      status: { [Op.notIn]: ["cancelled"] },
    },
    attributes: ["startTime", "endTime", "status"],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const conflict = existing.some((b) => {
    const s = timeToMinutes(b.startTime);
    const e = timeToMinutes(b.endTime);
    return s < endMin && e > startMin; // overlap
  });

  if (conflict) {
    const err = new Error("Slot đã có người đặt. Vui lòng chọn slot khác.");
    err.statusCode = 409;
    throw err;
  }
}

const bookingService = {
  // PT share vào gym hiện tại của member (TrainerShare-only)
  async getAvailableTrainers(userId) {
    const member = await getMemberByUserId(userId);
    if (!member) {
      const err = new Error("Không tìm thấy Member theo user hiện tại.");
      err.statusCode = 404;
      throw err;
    }

    const today = new Date();
    const shares = await db.TrainerShare.findAll({
      where: {
        toGymId: member.gymId,
        status: "approved",
        startDate: { [Op.lte]: today },
        endDate: { [Op.gte]: today },
      },
      include: [
        {
          model: db.Trainer,
          include: [{ model: db.User, attributes: ["id", "username", "email"] }],
        },
        { model: db.Gym, as: "fromGym", attributes: ["id", "name"] },
        { model: db.Gym, as: "toGym", attributes: ["id", "name"] },
      ],
      order: [["id", "DESC"]],
    });

    const map = new Map();
    for (const s of shares) {
      if (s.Trainer && !map.has(s.trainerId)) {
        map.set(s.trainerId, {
          ...s.Trainer.toJSON(),
          share: {
            id: s.id,
            fromGym: s.fromGym,
            toGym: s.toGym,
            startDate: s.startDate,
            endDate: s.endDate,
            status: s.status,
          },
        });
      }
    }
    return Array.from(map.values());
  },

  // Slots trống theo lịch làm việc của PT (availableHours) trừ các booking đã tồn tại
  async getAvailableSlots(userId, { trainerId, date }) {
    const member = await getMemberByUserId(userId);
    if (!member) {
      const err = new Error("Không tìm thấy Member.");
      err.statusCode = 404;
      throw err;
    }

    if (!trainerId || !date) {
      const err = new Error("Thiếu trainerId hoặc date (YYYY-MM-DD).");
      err.statusCode = 400;
      throw err;
    }

    const bookingDateStr = assertDateOnly(date);
    const bookingDateObj = toDateObj(bookingDateStr);

    // ✅ chặn ngày quá khứ luôn ở BE
    const todayStr = getLocalTodayStr();
    if (bookingDateStr < todayStr) return [];

    const trainer = await db.Trainer.findByPk(trainerId);
    if (!trainer) {
      const err = new Error("Không tìm thấy Trainer.");
      err.statusCode = 404;
      throw err;
    }

    await assertTrainerShareToGym({
      trainerId: trainer.id,
      gymId: member.gymId,
      bookingDateObj,
    });

    const availableHours = safeParseJSON(trainer.availableHours, {});
    const day = bookingDateObj.getDay();
    const dayKey = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][day];
    const avail = Array.isArray(availableHours?.[dayKey]) ? availableHours[dayKey] : [];
    if (avail.length === 0) return [];

    const bookings = await db.Booking.findAll({
      where: {
        trainerId: trainer.id,
        gymId: member.gymId,
        bookingDate: bookingDateStr,
        status: { [Op.notIn]: ["cancelled"] },
      },
      attributes: ["startTime", "endTime", "status"],
    });

    const busy = bookings.map((b) => ({
      start: timeToMinutes(b.startTime),
      end: timeToMinutes(b.endTime),
    }));

    const slots = [];
    const todayMin = nowMinutesLocal();

    for (const range of avail) {
      if (!range?.start || !range?.end) continue;

      const startMin = timeToMinutes(range.start);
      const endMin = timeToMinutes(range.end);

      for (let t = startMin; t + SLOT_MINUTES <= endMin; t += SLOT_MINUTES) {
        const s = t;
        const e = t + SLOT_MINUTES;

        // ✅ nếu là hôm nay: bỏ các slot đã qua
        if (bookingDateStr === todayStr && s <= todayMin) continue;

        const overlapped = busy.some((x) => x.start < e && x.end > s);
        if (!overlapped) {
          slots.push({
            startTime: minutesToTime(s),
            endTime: minutesToTime(e),
          });
        }
      }
    }

    return slots;
  },

  // Create booking (atomic-ish)
  async createBooking(userId, payload) {
    const t = await db.sequelize.transaction();
    try {
      const member = await getMemberByUserId(userId);
      if (!member) {
        const err = new Error("Không tìm thấy Member.");
        err.statusCode = 404;
        throw err;
      }

      const { trainerId, date, startTime, notes, sessionType } = payload;

      if (!trainerId || !date || !startTime) {
        const err = new Error("Thiếu trainerId / date / startTime.");
        err.statusCode = 400;
        throw err;
      }

      const bookingDateStr = assertDateOnly(date);
      const bookingDateObj = toDateObj(bookingDateStr);

      if (!isSlotAligned(startTime)) {
        const err = new Error(`startTime phải theo slot ${SLOT_MINUTES} phút (vd 09:00).`);
        err.statusCode = 400;
        throw err;
      }

      // ✅ chặn quá khứ ở BE (nghiệp vụ)
      assertNotPastBooking(bookingDateStr, startTime);

      const startMin = timeToMinutes(startTime);
      const endMin = startMin + SLOT_MINUTES;
      const endTime = minutesToTime(endMin);

      const trainer = await db.Trainer.findByPk(trainerId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!trainer) {
        const err = new Error("Không tìm thấy Trainer.");
        err.statusCode = 404;
        throw err;
      }

      await assertTrainerShareToGym({
        trainerId: trainer.id,
        gymId: member.gymId,
        bookingDateObj,
      });

      const activation = await getActivePackageActivation(member.id);
      if (!activation) {
        const err = new Error("Bạn chưa có gói tập đang hoạt động hoặc đã hết buổi.");
        err.statusCode = 400;
        throw err;
      }

      // ✅ check overlap với lock trong transaction
      await assertNoOverlapLocked({
        trainerId: trainer.id,
        gymId: member.gymId,
        bookingDateStr,
        startMin,
        endMin,
        transaction: t,
      });

      const booking = await db.Booking.create(
        {
          memberId: member.id,
          trainerId: trainer.id,
          gymId: member.gymId,
          packageId: activation.packageId,
          packageActivationId: activation.id,
          bookingDate: bookingDateStr, // ✅ DATEONLY string
          startTime: minutesToTime(startMin),
          endTime,
          sessionType: sessionType || "personal_training",
          notes: notes || null,
          status: "confirmed",
          createdBy: userId,
        },
        { transaction: t }
      );

      await t.commit();
      return booking;
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async getMyBookings(userId) {
    const member = await getMemberByUserId(userId);
    if (!member) {
      const err = new Error("Không tìm thấy Member.");
      err.statusCode = 404;
      throw err;
    }

    return db.Booking.findAll({
      where: { memberId: member.id },
      include: [
        { model: db.Trainer, include: [{ model: db.User, attributes: ["username", "email"] }] },
        { model: db.Gym, attributes: ["id", "name"] },
        { model: db.Package, attributes: ["id", "name", "type"] },
      ],
      order: [["bookingDate", "DESC"], ["startTime", "ASC"]],
    });
  },

  async cancelBooking(userId, bookingId, payload) {
    const t = await db.sequelize.transaction();
    try {
      const member = await getMemberByUserId(userId);
      if (!member) {
        const err = new Error("Không tìm thấy Member.");
        err.statusCode = 404;
        throw err;
      }

      const booking = await db.Booking.findByPk(bookingId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!booking || booking.memberId !== member.id) {
        const err = new Error("Không tìm thấy booking của bạn.");
        err.statusCode = 404;
        throw err;
      }

      if (!["pending", "confirmed"].includes(booking.status)) {
        const err = new Error("Chỉ được huỷ booking khi pending/confirmed.");
        err.statusCode = 400;
        throw err;
      }

      await booking.update(
        {
          status: "cancelled",
          cancellationReason: payload?.reason || null,
          cancellationDate: new Date(),
          cancellationBy: userId,
        },
        { transaction: t }
      );

      await t.commit();
      return booking;
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async checkinBooking(userId, bookingId, payload) {
    const t = await db.sequelize.transaction();
    try {
      const member = await getMemberByUserId(userId);
      if (!member) {
        const err = new Error("Không tìm thấy Member.");
        err.statusCode = 404;
        throw err;
      }

      const booking = await db.Booking.findByPk(bookingId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!booking || booking.memberId !== member.id) {
        const err = new Error("Không tìm thấy booking của bạn.");
        err.statusCode = 404;
        throw err;
      }

      if (!["confirmed"].includes(booking.status)) {
        const err = new Error("Chỉ check-in khi booking đang confirmed.");
        err.statusCode = 400;
        throw err;
      }

      const now = new Date();

      await db.Attendance.create(
        {
          userId,
          gymId: booking.gymId,
          bookingId: booking.id,
          checkInTime: now,
          attendanceType: "member",
          method: payload?.method || "qr",
          status: "present",
        },
        { transaction: t }
      );

      await booking.update({ status: "in_progress", checkinTime: now }, { transaction: t });

      await t.commit();
      return booking;
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async checkoutBooking(userId, bookingId) {
    const t = await db.sequelize.transaction();
    try {
      const member = await getMemberByUserId(userId);
      if (!member) {
        const err = new Error("Không tìm thấy Member.");
        err.statusCode = 404;
        throw err;
      }

      const booking = await db.Booking.findByPk(bookingId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!booking || booking.memberId !== member.id) {
        const err = new Error("Không tìm thấy booking của bạn.");
        err.statusCode = 404;
        throw err;
      }

      if (!["in_progress", "confirmed"].includes(booking.status)) {
        const err = new Error("Chỉ checkout khi booking in_progress/confirmed.");
        err.statusCode = 400;
        throw err;
      }

      const activation = await db.PackageActivation.findByPk(booking.packageActivationId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!activation || activation.status !== "active") {
        const err = new Error("Gói tập không còn active.");
        err.statusCode = 400;
        throw err;
      }

      if (activation.sessionsRemaining <= 0) {
        const err = new Error("Gói tập đã hết buổi.");
        err.statusCode = 400;
        throw err;
      }

      await activation.update(
        {
          sessionsUsed: (activation.sessionsUsed || 0) + 1,
          sessionsRemaining: activation.sessionsRemaining - 1,
          status: activation.sessionsRemaining - 1 === 0 ? "completed" : activation.status,
        },
        { transaction: t }
      );

      const trainer = await db.Trainer.findByPk(booking.trainerId, { transaction: t, lock: t.LOCK.UPDATE });
      if (trainer) {
        await trainer.update({ totalSessions: (trainer.totalSessions || 0) + 1 }, { transaction: t });
      }

      await booking.update({ status: "completed", checkoutTime: new Date() }, { transaction: t });

      await t.commit();
      return booking;
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};

export default bookingService;
