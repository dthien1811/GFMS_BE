const db = require("../models");
const realtimeService = require("./realtime.service").default;

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
    const err = new Error(
      "Buổi tập này đã được chốt kỳ lương hoặc đã chi trả cho PT. Không thể thay đổi điểm danh."
    );
    err.statusCode = 400;
    throw err;
  }
};

const assertSessionAllowsUndoAttendance = (booking) => {
  const raw = booking?.bookingDate;
  if (!raw) return;
  const dateStr =
    typeof raw === "string"
      ? raw.slice(0, 10)
      : new Date(raw).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
  let endPart = String(booking.endTime || "23:59:59");
  if (/^\d{2}:\d{2}$/.test(endPart)) endPart = `${endPart}:00`;
  const end = new Date(`${dateStr}T${endPart}`);
  if (Number.isNaN(end.getTime())) return;
  if (Date.now() > end.getTime()) {
    const err = new Error("Buổi tập đã kết thúc, không thể hoàn tác điểm danh.");
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
  const bookingPackageId = booking.packageId || null;
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

  // Fallback cho booking cũ/ngoại lệ chưa gắn packageActivationId:
  // lấy trực tiếp từ packageId của booking để vẫn sinh commission realtime.
  if ((!sessionValue || sessionValue <= 0) && bookingPackageId) {
    const pkg = await Package.findByPk(bookingPackageId, {
      attributes: ["id", "price", "sessions"],
    });
    if (pkg) {
      const totalSessions = Number(pkg.sessions || 0);
      const price = Number(pkg.price || 0);
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

const emitBookingStatusRealtime = async ({ booking, trainer, attendanceStatus }) => {
  try {
    const gymId = booking?.gymId || trainer?.gymId || null;
    const payload = {
      bookingId: booking?.id,
      status: booking?.status,
      attendanceStatus,
      gymId,
      trainerId: booking?.trainerId || trainer?.id || null,
      memberId: booking?.memberId || null,
      bookingDate: booking?.bookingDate || null,
      startTime: booking?.startTime || null,
      endTime: booking?.endTime || null,
    };

    if (gymId) {
      realtimeService.emitGym(gymId, "booking:status-changed", payload);
      const gym = await db.Gym.findByPk(gymId, { attributes: ["ownerId"] });
      if (gym?.ownerId) {
        realtimeService.emitUser(gym.ownerId, "booking:status-changed", payload);
      }
    }
  } catch (error) {
    console.error("[trainerAttendanceService] emit booking status error:", error.message);
  }
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

const consumePackageSessionForBooking = async (booking) => {
  if (!booking?.packageActivationId) return null;
  const PackageActivation = db.PackageActivation || db.packageactivation;
  mustHaveModel(PackageActivation, "PackageActivation");

  const activation = await PackageActivation.findByPk(booking.packageActivationId);
  if (!activation || activation.sessionsRemaining <= 0) return activation;

  await activation.update({
    sessionsUsed: (activation.sessionsUsed || 0) + 1,
    sessionsRemaining: Math.max(0, activation.sessionsRemaining - 1),
    status: activation.sessionsRemaining - 1 <= 0 ? "completed" : activation.status,
  });

  return activation;
};

const restorePackageSessionForBooking = async (booking) => {
  if (!booking?.packageActivationId) return null;
  const PackageActivation = db.PackageActivation || db.packageactivation;
  mustHaveModel(PackageActivation, "PackageActivation");

  const activation = await PackageActivation.findByPk(booking.packageActivationId);
  if (!activation) return activation;

  await activation.update({
    sessionsUsed: Math.max(0, (activation.sessionsUsed || 0) - 1),
    sessionsRemaining: (activation.sessionsRemaining || 0) + 1,
    status: "active",
  });

  return activation;
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

  const Commission = db.Commission || db.commission;
  let commissionByBookingId = new Map();
  try {
    if (Commission && bookingIds.length) {
      const commRows = await Commission.findAll({
        where: { bookingId: bookingIds },
        attributes: ["bookingId", "status"],
      });
      commissionByBookingId = new Map(
        commRows.map((c) => [c.bookingId, c.status])
      );
    }
  } catch (e) {
    commissionByBookingId = new Map();
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
      commissionStatus: commissionByBookingId.get(b.id) || null,
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

  await emitBookingStatusRealtime({ booking, trainer, attendanceStatus: normalizedStatus });

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
  const previousBookingStatus = String(booking.status || "").toLowerCase();

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

  if (["present", "completed"].includes(normalizedStatus) && previousBookingStatus !== "completed") {
    try {
      await consumePackageSessionForBooking(booking);
    } catch (e) {
      console.error("[trainerAttendanceService] consume package session error:", e.message);
    }
  }

  await emitBookingStatusRealtime({ booking, trainer, attendanceStatus: normalizedStatus });

  try {
    const member = booking.memberId ? await db.Member.findByPk(booking.memberId, { attributes: ["userId"] }) : null;
    await realtimeService.notifyUser(member?.userId, {
      title: "Buổi tập đã hoàn thành",
      message: `Buổi tập #${booking.id} của bạn đã được PT xác nhận hoàn thành.`,
      notificationType: "booking_update",
      relatedType: "booking",
      relatedId: booking.id,
    });
  } catch (e) {
    console.error("[trainerAttendanceService] notify member error:", e.message);
  }

  try {
    await syncCommissionForAttendance({ trainer, booking, normalizedStatus });
  } catch (e) {
    console.error("[trainerAttendanceService] commission sync error (checkOut):", e.message);
  }

  return { booking, attendance };
};

const resetAttendance = async ({ userId, bookingId }) => {
  const Booking = db.Booking || db.booking;
  const Attendance = db.Attendance || db.attendance;

  mustHaveModel(Booking, "Booking");
  mustHaveModel(Attendance, "Attendance");

  const trainer = await getTrainerByAuthId(userId);
  const booking = await Booking.findOne({ where: { id: bookingId } });
  if (!booking) throw Object.assign(new Error("Booking not found"), { statusCode: 404 });
  const previousBookingStatus = String(booking.status || "").toLowerCase();

  const bookingTrainerId = Number(booking.trainerId || booking.ptId || 0);
  if (bookingTrainerId && bookingTrainerId !== Number(trainer.id)) {
    throw Object.assign(new Error("Không có quyền cập nhật điểm danh buổi này"), { statusCode: 403 });
  }

  assertSessionAllowsUndoAttendance(booking);

  await ensureAttendanceEditable(booking.id);

  const attendance = await Attendance.findOne({
    where: { bookingId: booking.id, attendanceType: "trainer", userId },
    attributes: SAFE_ATT_COLS,
  });
  const previousAttendanceStatus = String(attendance?.status || "").toLowerCase();

  if (attendance) {
    await attendance.destroy();
  }

  booking.status = "confirmed";
  await booking.save();

  if (previousBookingStatus === "completed" && ["present", "completed"].includes(previousAttendanceStatus)) {
    try {
      await restorePackageSessionForBooking(booking);
    } catch (e) {
      console.error("[trainerAttendanceService] restore package session error:", e.message);
    }
  }

  await emitBookingStatusRealtime({ booking, trainer, attendanceStatus: "reset" });

  try {
    await syncCommissionForAttendance({ trainer, booking, normalizedStatus: "reset" });
  } catch (e) {
    console.error("[trainerAttendanceService] commission sync error (resetAttendance):", e.message);
  }

  return { booking, attendance: null };
};

module.exports = { getMyScheduleForDate, checkIn, checkOut, resetAttendance };