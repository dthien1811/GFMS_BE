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

const SAFE_ATT_COLS = [
  'id', 'userId', 'gymId', 'bookingId', 
  'checkInTime', 'checkOutTime', 
  'attendanceType', 'method', 'status', 
  'createdAt', 'updatedAt'
];

// Không cho phép chỉnh sửa điểm danh nếu buổi đã được chi trả / chốt kỳ
const ensureAttendanceEditable = async (bookingId) => {
  const Commission = db.Commission || db.commission;
  mustHaveModel(Commission, "Commission");

  const existing = await Commission.findOne({ where: { bookingId } });
  if (existing && existing.status && existing.status !== "pending") {
    const err = new Error("Buổi này đã được chốt/chi trả, không thể chỉnh sửa điểm danh.");
    err.statusCode = 400;
    throw err;
  }
};

// Đồng bộ hoa hồng theo trạng thái điểm danh của 1 booking
// - Nếu status = present/completed  → đảm bảo có 1 dòng commission (pending)
// - Nếu status khác (absent, ...)   → xóa commission pending của booking đó
const syncCommissionForAttendance = async ({ trainer, booking, normalizedStatus }) => {
  const Commission = db.Commission || db.commission;
  const PackageActivation = db.PackageActivation || db.packageactivation;
  const Package = db.Package || db.package;
  const Policy = db.Policy || db.policy;

  mustHaveModel(Commission, "Commission");
  mustHaveModel(PackageActivation, "PackageActivation");
  mustHaveModel(Package, "Package");

  const gymId = booking.gymId || trainer.gymId;
  if (!gymId) return;

  const existing = await Commission.findOne({ where: { bookingId: booking.id } });

  // Nếu đánh dấu vắng / không hiện diện → xóa commission pending (nếu có)
  if (normalizedStatus !== "present" && normalizedStatus !== "completed") {
    if (existing && existing.status === "pending") {
      await existing.destroy();
    }
    return;
  }

  // present/completed nhưng đã có commission rồi → không làm gì thêm
  if (existing) return;

  const activationId = booking.packageActivationId || booking.activationId || null;
  let sessionValue = 0;

  if (activationId) {
    const activation = await PackageActivation.findByPk(activationId, {
      include: [{ model: Package, attributes: ["id", "price", "sessions"] }],
    });
    if (activation && activation.Package) {
      const totalSessions = Number(
        activation.totalSessions ?? activation.Package.sessions ?? 0
      );
      const price = Number(activation.Package.price || 0);
      if (totalSessions > 0 && price > 0) {
        sessionValue = price / totalSessions;
      }
    }
  }

  if (!sessionValue || !Number.isFinite(sessionValue) || sessionValue <= 0) return;

  // Lấy tỷ lệ hoa hồng theo policy commission của gym
  let ownerRate = 0.15;
  if (Policy) {
    const policy = await Policy.findOne({
      where: {
        policyType: "commission",
        appliesTo: "gym",
        gymId,
        isActive: true,
      },
      order: [["createdAt", "DESC"]],
    });
    if (policy) {
      let value = policy.value;
      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch {
          value = {};
        }
      }
      if (value && typeof value.ownerRate === "number") {
        ownerRate = value.ownerRate;
      }
    }
  }

  if (ownerRate < 0 || ownerRate > 1) ownerRate = 0.15;
  const trainerRate = 1 - ownerRate;
  const commissionAmount = sessionValue * trainerRate;

  await Commission.create({
    trainerId: trainer.id,
    bookingId: booking.id,
    gymId,
    activationId: activationId || null,
    payrollPeriodId: null,
    sessionDate: booking.bookingDate || new Date(),
    sessionValue,
    commissionRate: trainerRate,
    commissionAmount,
    status: "pending",
  });
};

const getTrainerByAuthId = async (authId) => {
  const Trainer = db.Trainer || db.trainer;
  mustHaveModel(Trainer, "Trainer");

  let trainer = await Trainer.findOne({
    where: { userId: authId },
    attributes: ["id", "userId", "gymId"],
  });

  if (!trainer) {
    trainer = await Trainer.findByPk(authId, { attributes: ["id", "userId", "gymId"] });
  }

  if (!trainer) {
    const err = new Error("Trainer profile not found");
    err.statusCode = 404;
    throw err;
  }
  return trainer;
};

const pickAllowed = (Model, data) => {
  if (!Model?.rawAttributes) return data;
  const allowed = new Set(Object.keys(Model.rawAttributes));
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (allowed.has(k) && v !== undefined) out[k] = v;
  }
  return out;
};

const pickField = (Model, candidates) => {
  const attrs = Model?.rawAttributes || {};
  return candidates.find((c) => !!attrs[c]) || null;
};

// ===================
// GET schedule (GIỮ LOGIC CŨ + THÊM INCLUDE ĐỂ HIỆN TÊN)
// ===================
const getMyScheduleForDate = async ({ userId, date, status }) => {
  const Booking = db.Booking || db.booking;
  const Attendance = db.Attendance || db.attendance;
  const Gym = db.Gym || db.gym;
  const Member = db.Member || db.member; // Thêm Member

  mustHaveModel(Booking, "Booking");
  mustHaveModel(Attendance, "Attendance");

  const trainer = await getTrainerByAuthId(userId);
  const bookingDate = normalizeDateOnly(date) || new Date().toISOString().slice(0, 10);

  const trainerField = pickField(Booking, ["trainerId", "ptId", "trainer_id"]);
  const dateField = pickField(Booking, ["bookingDate", "date", "booking_date"]);
  const startTimeField = pickField(Booking, ["startTime", "start_time", "start"]);

  if (!trainerField || !dateField) return { trainer, bookingDate, rows: [] };

  const where = { [trainerField]: trainer.id, [dateField]: bookingDate };
  const statusField = pickField(Booking, ["status"]);
  if (status && statusField) where[statusField] = String(status).trim().toLowerCase();

  const include = [];
  if (Gym && Booking.associations && Booking.associations.Gym) {
    include.push({ model: Gym, required: false });
  }

  // 🔹 PHẦN THÊM VÀO: Lấy thông tin học viên và tên từ User
  if (Member && Booking.associations && Booking.associations.Member) {
    include.push({
      model: Member,
      as: 'Member',
      include: [{
        model: db.User,
        as: 'User',
        attributes: ['username']
      }]
    });
  }

  let bookings = [];
  try {
    const order = [[dateField, "ASC"]];
    if (startTimeField) order.push([startTimeField, "ASC"]);
    bookings = await Booking.findAll({ where, order, include });
  } catch (e) {
    bookings = [];
  }

  const bookingIds = bookings.map((b) => b.id);
  let trainerAttendances = [];
  try {
    if (bookingIds.length) {
      trainerAttendances = await Attendance.findAll({
        where: { bookingId: bookingIds, attendanceType: "trainer", userId },
        attributes: SAFE_ATT_COLS,
      });
    }
  } catch (e) {
    trainerAttendances = [];
  }

  const attByBookingId = new Map();
  for (const a of trainerAttendances) {
    attByBookingId.set(a.bookingId, a.toJSON ? a.toJSON() : a);
  }

  const rows = bookings.map((b) => {
    const plainBooking = b.toJSON ? b.toJSON() : b;
    return {
      ...plainBooking,
      trainerAttendance: attByBookingId.get(b.id) || null,
    };
  });

  return { trainer, bookingDate, rows };
};

const checkIn = async ({ userId, bookingId, method = "manual", status = "present" }) => {
  const Booking = db.Booking || db.booking;
  const Attendance = db.Attendance || db.attendance;

  mustHaveModel(Booking, "Booking");
  mustHaveModel(Attendance, "Attendance");

  const trainer = await getTrainerByAuthId(userId);
  const booking = await Booking.findOne({ where: { id: bookingId } });
  if (!booking) throw Object.assign(new Error("Booking not found"), { statusCode: 404 });

  // chặn sửa nếu đã chi trả
  await ensureAttendanceEditable(booking.id);

  const t = now();
  const normalizedStatus = String(status || "present").toLowerCase();

  let attendance = await Attendance.findOne({
    where: { bookingId: booking.id, attendanceType: "trainer", userId },
    attributes: SAFE_ATT_COLS,
  });

  if (!attendance) {
    attendance = await Attendance.create({
      userId,
      gymId: booking.gymId || trainer.gymId || null,
      bookingId: booking.id,
      checkInTime: t,
      attendanceType: "trainer",
      method,
      status: normalizedStatus,
    });
  } else {
    attendance.status = normalizedStatus;
    attendance.checkInTime = t;
    attendance.checkOutTime = null;
    attendance.method = method;
    await attendance.save({
      fields: ["status", "checkInTime", "checkOutTime", "method", "updatedAt"],
    });
  }

  booking.status = "in_progress";
  await booking.save();

  try {
    await syncCommissionForAttendance({ trainer, booking, normalizedStatus });
  } catch (e) {
    console.error("[trainerAttendanceService] commission sync error (checkIn):", e.message);
  }

  return { booking, attendance };
};

// ===================
// Check-out (GIỮ NGUYÊN CODE CỦA BẠN - CÓ THÊM FIX CHỈNH SỬA)
// ===================
const checkOut = async ({ userId, bookingId, status = "absent" }) => {
  const Booking = db.Booking || db.booking;
  const Attendance = db.Attendance || db.attendance;

  mustHaveModel(Booking, "Booking");
  mustHaveModel(Attendance, "Attendance");

  const trainer = await getTrainerByAuthId(userId);
  const booking = await Booking.findOne({ where: { id: bookingId } });
  if (!booking) throw Object.assign(new Error("Booking not found"), { statusCode: 404 });

  // chặn sửa nếu đã chi trả
  await ensureAttendanceEditable(booking.id);

  const t = now();
  const normalizedStatus = String(status || "absent").toLowerCase();

  let attendance = await Attendance.findOne({
    where: { bookingId: booking.id, attendanceType: "trainer", userId },
    attributes: SAFE_ATT_COLS, // 🔹 Chặn lỗi memberId
  });

  if (!attendance) {
    attendance = await Attendance.create({
      userId,
      gymId: booking.gymId || trainer.gymId || null,
      bookingId: booking.id,
      checkOutTime: t,
      attendanceType: "trainer",
      method: "manual",
      status: normalizedStatus,
    });
  } else {
    attendance.status = normalizedStatus;
    attendance.checkOutTime = t;
    await attendance.save({ fields: ["status", "checkOutTime", "updatedAt"] });
  }

  booking.status = "completed";
  await booking.save();

  try {
    await syncCommissionForAttendance({ trainer, booking, normalizedStatus });
  } catch (e) {
    console.error("[trainerAttendanceService] commission sync error (checkOut):", e.message);
  }

  return { booking, attendance };
};

module.exports = { getMyScheduleForDate, checkIn, checkOut };