// src/service/trainerAttendanceService.js
const db = require("../models");

const mustHaveModel = (Model, name) => {
  if (!Model) {
    const err = new Error(`Missing Sequelize model: ${name}`);
    err.statusCode = 500;
    throw err;
  }
};

const normalizeDateOnly = (dateStr) => {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
};

const now = () => new Date();

// ✅ Resolve trainer by either userId (from JWT) or trainerId (from middleware that sets req.user.id=trainerId)
const getTrainerByAuthId = async (authId) => {
  const Trainer = db.Trainer || db.trainer;
  mustHaveModel(Trainer, "Trainer");

  // 1) Try authId as userId
  let trainer = await Trainer.findOne({
    where: { userId: authId },
    attributes: ["id", "userId", "gymId"],
  });

  // 2) Try authId as trainerId
  if (!trainer) {
    trainer = await Trainer.findByPk(authId, {
      attributes: ["id", "userId", "gymId"],
    });
  }

  if (!trainer) {
    const err = new Error("Trainer profile not found");
    err.statusCode = 404;
    throw err;
  }
  return trainer;
};

// Only set fields that exist in the model to avoid crash due to mismatch schema
const pickAllowed = (Model, data) => {
  if (!Model?.rawAttributes) return data;
  const allowed = new Set(Object.keys(Model.rawAttributes));
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (allowed.has(k) && v !== undefined) out[k] = v;
  }
  return out;
};

// helper pick field exists
const pickField = (Model, candidates) => {
  const attrs = Model?.rawAttributes || {};
  return candidates.find((c) => !!attrs[c]) || null;
};

// helper check association exists
const hasAssoc = (Source, Target) => {
  if (!Source?.associations || !Target) return false;
  return Object.values(Source.associations).some((a) => a?.target === Target);
};

// -----------------------
// GET schedule + trainer attendance for a date
// -----------------------
const getMyScheduleForDate = async ({ userId, date, status }) => {
  const Booking = db.Booking || db.booking;
  const Attendance = db.Attendance || db.attendance;
  const Member = db.Member || db.member;
  const Gym = db.Gym || db.gym;

  mustHaveModel(Booking, "Booking");
  mustHaveModel(Attendance, "Attendance");

  const trainer = await getTrainerByAuthId(userId);
  const bookingDate = normalizeDateOnly(date) || new Date().toISOString().slice(0, 10);

  // pick safe fields
  const trainerField = pickField(Booking, ["trainerId", "ptId", "trainer_id"]);
  const dateField = pickField(Booking, ["bookingDate", "date", "booking_date"]);
  const startTimeField = pickField(Booking, ["startTime", "start_time", "start"]);

  // missing core fields => return empty (do not 500)
  if (!trainerField || !dateField) {
    return { trainer, bookingDate, rows: [] };
  }

  const where = { [trainerField]: trainer.id, [dateField]: bookingDate };

  const statusField = pickField(Booking, ["status"]);
  if (status && statusField) where[statusField] = String(status).trim().toLowerCase();

  // include only if association exists
  const include = [];
  if (Gym && hasAssoc(Booking, Gym)) include.push({ model: Gym, required: false });
  if (Member && hasAssoc(Booking, Member)) include.push({ model: Member, required: false });

  let bookings = [];
  try {
    const order = [];
    order.push([dateField, "ASC"]);
    if (startTimeField) order.push([startTimeField, "ASC"]);

    bookings = await Booking.findAll({ where, order, include });
  } catch (e) {
    // ✅ never 500 for "no bookings / mismatch schema / bad include"
   
    return { trainer, bookingDate, rows: [] };
  }

  const bookingIds = bookings.map((b) => b.id);

  let trainerAttendances = [];
  try {
    trainerAttendances = bookingIds.length
      ? await Attendance.findAll({
          where: {
            bookingId: bookingIds,
            attendanceType: "trainer",
            userId,
          },
        })
      : [];
  } catch (e) {
    // attendance query fail => still return bookings with null attendance
   
    trainerAttendances = [];
  }

  const attByBookingId = new Map();
  for (const a of trainerAttendances) attByBookingId.set(a.bookingId, a);

  const rows = bookings.map((b) => {
    const plain = b.toJSON ? b.toJSON() : b;
    return {
      ...plain,
      trainerAttendance: attByBookingId.get(b.id) || null,
    };
  });

  return { trainer, bookingDate, rows };
};

// -----------------------
// Check-in (trainer)
// -----------------------
const checkIn = async ({ userId, bookingId, method = "manual", status = "present" }) => {
  const Booking = db.Booking || db.booking;
  const Attendance = db.Attendance || db.attendance;

  mustHaveModel(Booking, "Booking");
  mustHaveModel(Attendance, "Attendance");

  const trainer = await getTrainerByAuthId(userId);

  const booking = await Booking.findOne({ where: { id: bookingId } });
  if (!booking) {
    const err = new Error("Booking not found");
    err.statusCode = 404;
    throw err;
  }

  // trainerId field might differ => try safe compare
  const bookingTrainerId =
    booking.trainerId ?? booking.ptId ?? booking.trainer_id ?? booking.dataValues?.trainerId ?? booking.dataValues?.ptId;

  if (Number(bookingTrainerId) !== Number(trainer.id)) {
    const err = new Error("Forbidden: booking is not assigned to this trainer");
    err.statusCode = 403;
    throw err;
  }

  const normalizedMethod = String(method || "manual").trim().toLowerCase();
  const allowedMethods = ["qr", "nfc", "manual"];
  if (!allowedMethods.includes(normalizedMethod)) {
    const err = new Error(`Invalid method: ${method}`);
    err.statusCode = 400;
    throw err;
  }

  const normalizedStatus = String(status || "present").trim().toLowerCase();
  const allowedStatus = ["present", "late", "absent"];
  if (!allowedStatus.includes(normalizedStatus)) {
    const err = new Error(`Invalid status: ${status}`);
    err.statusCode = 400;
    throw err;
  }

  const t = now();

  let attendance = await Attendance.findOne({
    where: { bookingId: booking.id, attendanceType: "trainer", userId },
  });

  if (!attendance) {
    attendance = await Attendance.create(
      pickAllowed(Attendance, {
        userId,
        gymId: booking.gymId || trainer.gymId || null,
        bookingId: booking.id,
        checkInTime: t,
        attendanceType: "trainer",
        method: normalizedMethod,
        status: normalizedStatus,
      })
    );
  } else {
    if (!attendance.checkInTime) attendance.checkInTime = t;
    attendance.method = normalizedMethod;
    attendance.status = normalizedStatus;
    await attendance.save();
  }

  // Sync booking.checkinTime + status (set only if fields exist)
  if ("checkinTime" in booking && !booking.checkinTime) booking.checkinTime = t;

  const bStatus = String(booking.status || "").toLowerCase();
  if ("status" in booking && (bStatus === "pending" || bStatus === "confirmed")) booking.status = "in_progress";

  await booking.save();

  return { booking, attendance };
};

// -----------------------
// Check-out (trainer) + complete booking + (optional) session progress
// -----------------------
const checkOut = async ({
  userId,
  bookingId,
  sessionNotes,
  exercises,
  weight,
  bodyFat,
  muscleMass,
  sessionRating,
}) => {
  const Booking = db.Booking || db.booking;
  const Attendance = db.Attendance || db.attendance;
  const SessionProgress = db.SessionProgress || db.sessionprogress;
  const Member = db.Member || db.member;

  mustHaveModel(Booking, "Booking");
  mustHaveModel(Attendance, "Attendance");

  const hasSessionProgress = !!SessionProgress;

  const trainer = await getTrainerByAuthId(userId);

  const booking = await Booking.findOne({ where: { id: bookingId } });
  if (!booking) {
    const err = new Error("Booking not found");
    err.statusCode = 404;
    throw err;
  }

  const bookingTrainerId =
    booking.trainerId ?? booking.ptId ?? booking.trainer_id ?? booking.dataValues?.trainerId ?? booking.dataValues?.ptId;

  if (Number(bookingTrainerId) !== Number(trainer.id)) {
    const err = new Error("Forbidden: booking is not assigned to this trainer");
    err.statusCode = 403;
    throw err;
  }

  const t = now();

  let attendance = await Attendance.findOne({
    where: { bookingId: booking.id, attendanceType: "trainer", userId },
  });

  if (!attendance) {
    attendance = await Attendance.create(
      pickAllowed(Attendance, {
        userId,
        gymId: booking.gymId || trainer.gymId || null,
        bookingId: booking.id,
        checkInTime: booking.checkinTime || t,
        checkOutTime: t,
        attendanceType: "trainer",
        method: "manual",
        status: "present",
      })
    );
  } else {
    if (!attendance.checkInTime) attendance.checkInTime = booking.checkinTime || t;
    attendance.checkOutTime = t;
    await attendance.save();
  }

  // Sync booking (set only if fields exist)
  if ("checkinTime" in booking && !booking.checkinTime) booking.checkinTime = attendance.checkInTime || t;
  if ("checkoutTime" in booking) booking.checkoutTime = t;
  if ("status" in booking) booking.status = "completed";
  if ("sessionNotes" in booking && sessionNotes !== undefined) booking.sessionNotes = sessionNotes;

  await booking.save();

  // SessionProgress (optional)
  let progress = null;
  if (hasSessionProgress) {
    let p = await SessionProgress.findOne({ where: { bookingId: booking.id } });

    const payload = pickAllowed(SessionProgress, {
      bookingId: booking.id,
      trainerId: trainer.id,
      memberId: booking.memberId || null,
      attendanceId: attendance.id,
      notes: sessionNotes ?? null,
      exercises: exercises ?? null,
      weight: weight ?? null,
      bodyFat: bodyFat ?? null,
      muscleMass: muscleMass ?? null,
      sessionRating: sessionRating ?? null,
      completedAt: t,
    });

    if (!p) p = await SessionProgress.create(payload);
    else {
      Object.assign(p, payload);
      await p.save();
    }
    progress = p;
  }

  // Decrement sessionsRemaining if member has it
  if (Member && booking.memberId) {
    const member = await Member.findOne({ where: { id: booking.memberId } });
    if (member && typeof member.sessionsRemaining === "number" && member.sessionsRemaining > 0) {
      member.sessionsRemaining -= 1;
      await member.save();
    }
  }

  return { booking, attendance, progress };
};

module.exports = {
  getMyScheduleForDate,
  checkIn,
  checkOut,
};
