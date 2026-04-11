const db = require("../models");
const realtimeService = require("./realtime.service").default;
const { syncPackageActivationCountersByActivationId } = require("./member/booking.service");

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
const BUSY_REQUEST_NOTE_MARKER = "[PT_BUSY_REQUEST]";


const formatDateVN = (value) => {
  if (!value) return "ngày đã chọn";
  const s = String(value);
  const exact = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (exact) return `${exact[3]}/${exact[2]}/${exact[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "ngày đã chọn";
  return d.toLocaleDateString("vi-VN");
};

const toHHMM = (value) => String(value || "").slice(0, 5);

const formatBookingSlotLabel = (booking) => {
  const dateLabel = formatDateVN(booking?.bookingDate);
  const start = toHHMM(booking?.startTime);
  const end = toHHMM(booking?.endTime);
  return `${dateLabel}${start && end ? ` (${start}-${end})` : ""}`;
};

/** Owner phòng nhận (gym của booking) — khi PT bấm hoàn thành buổi, kể cả PT mượn. */
const notifyGymOwnerTrainerCompletedSession = async ({
  booking,
  trainer,
  previousBookingStatus,
}) => {
  if (String(previousBookingStatus || "").toLowerCase() === "completed") return;

  const gymId = booking?.gymId;
  if (!gymId) return;

  const gym = await db.Gym.findByPk(gymId, { attributes: ["id", "name", "ownerId"] });
  const ownerId = gym?.ownerId ? Number(gym.ownerId) : 0;
  if (!ownerId) return;

  let trainerName = "Huấn luyện viên";
  if (trainer?.userId) {
    const tu = await db.User.findByPk(trainer.userId, { attributes: ["username"] });
    if (tu?.username) trainerName = tu.username;
  }

  let memberLabel = "buổi tập";
  if (booking.memberId) {
    const mem = await db.Member.findByPk(booking.memberId, {
      attributes: ["id"],
      include: [{ model: db.User, attributes: ["username"] }],
    });
    const un = mem?.User?.username;
    memberLabel = un ? `hội viên ${un}` : `hội viên #${booking.memberId}`;
  }

  const slot = formatBookingSlotLabel(booking);
  const isShare = String(booking.sessionType || "").toLowerCase() === "trainer_share";
  const title = isShare ? "Buổi mượn PT đã hoàn thành" : "Buổi tập đã hoàn thành";
  const lead = isShare
    ? `${trainerName} (PT mượn) đã xác nhận hoàn thành ${memberLabel}.`
    : `${trainerName} đã xác nhận hoàn thành ${memberLabel}.`;
  const tail = [slot, gym?.name ? `Chi nhánh: ${gym.name}.` : ""].filter(Boolean).join(" ");

  await realtimeService.notifyUser(ownerId, {
    title,
    message: `${lead} ${tail}`.trim(),
    notificationType: "booking_update",
    relatedType: "booking",
    relatedId: booking.id,
  });
};

const notifyMemberSessionCompletion = async (booking, activation) => {
  const member = booking?.memberId
    ? await db.Member.findByPk(booking.memberId, { attributes: ["userId"] })
    : null;

  if (member?.userId) {
    await realtimeService.notifyUser(member.userId, {
      title: "Buổi tập đã hoàn thành",
      message: `Buổi tập ngày ${formatBookingSlotLabel(booking)} đã được PT xác nhận hoàn thành.`,
      notificationType: "booking_update",
      relatedType: "booking",
      relatedId: booking.id,
    });
  }

  if (!booking?.packageActivationId) return;

  const packageActivation =
    activation ||
    await db.PackageActivation.findByPk(booking.packageActivationId, {
      include: [{ model: db.Package, attributes: ["id", "name"] }],
    });

  if (!packageActivation || !member?.userId) return;

  if (Number(packageActivation.sessionsRemaining || 0) === 1 && String(packageActivation.status || "").toLowerCase() !== "completed") {
    await realtimeService.notifyUser(member.userId, {
      title: "Gói tập sắp hoàn thành",
      message: `Gói ${packageActivation.Package?.name || "tập"} của bạn còn 1 buổi sau khi hoàn thành buổi ${formatBookingSlotLabel(booking)}.`,
      notificationType: "package_purchase",
      relatedType: "packageActivation",
      relatedId: packageActivation.id,
    });
  }

  if (String(packageActivation.status || "").toLowerCase() === "completed") {
    await realtimeService.notifyUser(member.userId, {
      title: "Gói tập đã hoàn thành",
      message: `Gói ${packageActivation.Package?.name || "tập"} đã hoàn thành sau buổi ${formatBookingSlotLabel(booking)}. Bạn có thể vào mục đánh giá để gửi nhận xét.`,
      notificationType: "package_purchase",
      relatedType: "packageActivation",
      relatedId: packageActivation.id,
    });
  }
};

const toDateOnly = (raw) => {
  if (!raw) return null;
  if (typeof raw === "string") {
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const addDays = (d, days) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

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

const assertAttendanceDateWindow = (booking) => {
  const bookingDay = toDateOnly(booking?.bookingDate);
  if (!bookingDay) return;
  const today = toDateOnly(now());
  if (!today) return;

  // Chưa tới ngày buổi học thì không được điểm danh/chỉnh sửa.
  if (today.getTime() < bookingDay.getTime()) {
    const err = new Error("Chưa tới ngày buổi học, chưa thể điểm danh.");
    err.statusCode = 400;
    throw err;
  }

  // Quá 2 ngày kể từ ngày buổi học thì không cho chỉnh sửa lại điểm danh.
  const editableUntil = addDays(bookingDay, 2); // bookingDay + 2 days
  if (today.getTime() > editableUntil.getTime()) {
    const err = new Error("Đã qua ngày buổi học, không thể chỉnh sửa điểm danh.");
    err.statusCode = 400;
    throw err;
  }
};

const assertBusyRequestBeforeSixHours = (booking) => {
  const bookingDate = String(booking?.bookingDate || "").slice(0, 10);
  const startTime = String(booking?.startTime || "").slice(0, 5);
  if (!bookingDate || !startTime) {
    const err = new Error("Không xác định được thời gian bắt đầu buổi tập");
    err.statusCode = 400;
    throw err;
  }

  const slotStart = new Date(`${bookingDate}T${startTime}:00`);
  if (Number.isNaN(slotStart.getTime())) {
    const err = new Error("Thời gian buổi tập không hợp lệ");
    err.statusCode = 400;
    throw err;
  }

  const minLeadTime = 6 * 60 * 60 * 1000;
  if (slotStart.getTime() - Date.now() < minLeadTime) {
    const err = new Error("Yêu cầu báo bận phải gửi trước ít nhất 6 tiếng so với giờ bắt đầu");
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

  // Trainer share sessions are settled outside the system.
  // Do not create internal commissions for these bookings.
  const sessionType = String(booking?.sessionType || "").toLowerCase();
  if (sessionType === "trainer_share") {
    const existing = await Commission.findOne({ where: { bookingId: booking.id } });
    if (existing && existing.status === "pending") {
      await existing.destroy();
    }
    return;
  }

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

const emitBookingStatusRealtime = async ({ booking, trainer, attendanceStatus, source }) => {
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
      sessionType: booking?.sessionType || null,
      source: source || null,
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

const resolveBookingActivationIfMissing = async (booking) => {
  if (!booking || booking.packageActivationId || !booking.memberId) return booking;

  const PackageActivation = db.PackageActivation || db.packageactivation;
  const Package = db.Package || db.package;
  if (!PackageActivation || !Package) return booking;

  const activation = await PackageActivation.findOne({
    where: {
      memberId: booking.memberId,
      status: "active",
      sessionsRemaining: { [db.Sequelize.Op.gt]: 0 },
    },
    include: [
      {
        model: Package,
        required: true,
        where: {
          packageType: "personal_training",
          ...(booking.gymId ? { gymId: booking.gymId } : {}),
        },
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  if (!activation) return booking;

  booking.packageActivationId = activation.id;
  if (!booking.packageId) {
    booking.packageId = activation.packageId || activation.Package?.id || null;
  }
  await booking.save({ fields: ["packageActivationId", "packageId", "updatedAt"] });
  return booking;
};

const consumePackageSessionForBooking = async (booking) => {
  await resolveBookingActivationIfMissing(booking);
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
  const Request = db.Request || db.request;
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

  let busyRequestedByBookingId = new Set();
  try {
    if (Request && bookingIds.length > 0) {
      const busyRequests = await Request.findAll({
        where: {
          requestType: "BUSY_SLOT",
          status: { [db.Sequelize.Op.in]: ["PENDING", "APPROVED", "pending", "approved"] },
        },
        attributes: ["data"],
        order: [["createdAt", "DESC"]],
        limit: 500,
      });
      busyRequestedByBookingId = new Set(
        busyRequests
          .map((item) => Number(item?.data?.bookingId || 0))
          .filter((bookingId) => bookingId > 0 && bookingIds.includes(bookingId))
      );
    }
  } catch (_e) {
    busyRequestedByBookingId = new Set();
  }

  const rows = bookings.map((b) => {
    const plainBooking = b.toJSON ? b.toJSON() : b;
    return {
      ...plainBooking,
      busyRequested:
        busyRequestedByBookingId.has(Number(b.id)) ||
        String(plainBooking?.notes || "").includes(BUSY_REQUEST_NOTE_MARKER),
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

  const bookingTrainerId = Number(booking.trainerId || booking.ptId || 0);
  if (bookingTrainerId && bookingTrainerId !== Number(trainer.id)) {
    throw Object.assign(new Error("Không có quyền cập nhật điểm danh buổi này"), { statusCode: 403 });
  }

  // chặn sửa nếu đã chi trả
  await ensureAttendanceEditable(booking.id);
  assertAttendanceDateWindow(booking);

  const t = now();
  const normalizedStatus = String(status || "present").toLowerCase();
  if (normalizedStatus !== "present" && normalizedStatus !== "absent" && normalizedStatus !== "completed") {
    throw Object.assign(new Error("Trạng thái điểm danh không hợp lệ"), { statusCode: 400 });
  }

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
    await syncPackageActivationCountersByActivationId(booking.packageActivationId, null);
  } catch (e) {
    console.error("[trainerAttendanceService] activation counters (checkIn):", e.message);
  }

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

  const bookingTrainerIdOut = Number(booking.trainerId || booking.ptId || 0);
  if (bookingTrainerIdOut && bookingTrainerIdOut !== Number(trainer.id)) {
    throw Object.assign(new Error("Không có quyền cập nhật điểm danh buổi này"), { statusCode: 403 });
  }

  // chặn sửa nếu đã chi trả
  await ensureAttendanceEditable(booking.id);
  assertAttendanceDateWindow(booking);

  const t = now();
  const normalizedStatus = String(status || "absent").toLowerCase();
  if (normalizedStatus !== "present" && normalizedStatus !== "absent" && normalizedStatus !== "completed") {
    throw Object.assign(new Error("Trạng thái điểm danh không hợp lệ"), { statusCode: 400 });
  }

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
  if (Booking.rawAttributes?.checkoutTime) {
    booking.checkoutTime = t;
  }
  await booking.save();

  let consumedActivation = null;
  if (["present", "completed"].includes(normalizedStatus) && previousBookingStatus !== "completed") {
    try {
      consumedActivation = await consumePackageSessionForBooking(booking);
    } catch (e) {
      console.error("[trainerAttendanceService] consume package session error:", e.message);
    }
  }

  await emitBookingStatusRealtime({
    booking,
    trainer,
    attendanceStatus: normalizedStatus,
    source: "trainer_checkout",
  });

  try {
    await notifyGymOwnerTrainerCompletedSession({
      booking,
      trainer,
      previousBookingStatus,
    });
  } catch (e) {
    console.error("[trainerAttendanceService] notify owner error:", e.message);
  }

  try {
    await syncPackageActivationCountersByActivationId(booking.packageActivationId, null);
    await notifyMemberSessionCompletion(booking, consumedActivation);
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

  await ensureAttendanceEditable(booking.id);
  assertAttendanceDateWindow(booking);

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
    await syncPackageActivationCountersByActivationId(booking.packageActivationId, null);
  } catch (e) {
    console.error("[trainerAttendanceService] activation counters (resetAttendance):", e.message);
  }

  try {
    await syncCommissionForAttendance({ trainer, booking, normalizedStatus: "reset" });
  } catch (e) {
    console.error("[trainerAttendanceService] commission sync error (resetAttendance):", e.message);
  }

  return { booking, attendance: null };
};

const requestBusySlot = async ({ userId, bookingId, reason }) => {
  const Booking = db.Booking || db.booking;
  const Gym = db.Gym || db.gym;
  const Member = db.Member || db.member;
  const User = db.User || db.user;
  const Request = db.Request || db.request;

  mustHaveModel(Booking, "Booking");
  mustHaveModel(Request, "Request");

  const trainer = await getTrainerByAuthId(userId);
  const booking = await Booking.findOne({
    where: { id: bookingId },
    include: [
      Gym ? { model: Gym, attributes: ["id", "ownerId", "name"], required: false } : null,
      db.Package ? { model: db.Package, attributes: ["id", "name"], required: false } : null,
      Member
        ? {
            model: Member,
            as: "Member",
            attributes: ["id", "userId"],
            include: User ? [{ model: User, as: "User", attributes: ["id", "username"] }] : [],
            required: false,
          }
        : null,
    ].filter(Boolean),
  });
  if (!booking) throw Object.assign(new Error("Không tìm thấy lịch dạy"), { statusCode: 404 });

  const bookingTrainerId = Number(booking.trainerId || booking.ptId || 0);
  if (!bookingTrainerId || bookingTrainerId !== Number(trainer.id)) {
    throw Object.assign(new Error("Bạn không có quyền gửi yêu cầu cho lịch dạy này"), { statusCode: 403 });
  }

  const bookingStatus = String(booking.status || "").toLowerCase();
  if (["completed", "cancelled", "no_show"].includes(bookingStatus)) {
    throw Object.assign(new Error("Lịch dạy này không còn khả dụng để gửi yêu cầu báo bận"), { statusCode: 400 });
  }

  const sessionType = String(booking.sessionType || "").toLowerCase();
  if (sessionType === "trainer_share") {
    throw Object.assign(
      new Error("Khung giờ nhận từ chia sẻ không được phép gửi yêu cầu báo bận"),
      { statusCode: 400 }
    );
  }

  assertBusyRequestBeforeSixHours(booking);

  const ownerId = booking?.Gym?.ownerId || null;
  if (!ownerId) {
    throw Object.assign(new Error("Không tìm thấy chủ phòng tập để gửi yêu cầu"), { statusCode: 400 });
  }

  const dateLabel = String(booking.bookingDate || "").slice(0, 10);
  const timeLabel = `${String(booking.startTime || "").slice(0, 5)}-${String(booking.endTime || "").slice(0, 5)}`;
  const trainerLabel = `Huấn luyện viên #${trainer.id}`;
  const memberLabel =
    booking?.Member?.User?.username ||
    (booking?.memberId ? `Hội viên #${booking.memberId}` : "Chưa gắn hội viên");
  const gymLabel = booking?.Gym?.gymName || booking?.Gym?.name || (booking?.gymId ? `Phòng tập #${booking.gymId}` : "phòng tập");
  const reasonText = String(reason || "").trim();

  const existingRequests = await Request.findAll({
    where: {
      requesterId: userId,
      requestType: "BUSY_SLOT",
      status: { [db.Sequelize.Op.in]: ["PENDING", "APPROVED"] },
    },
    attributes: ["id", "status", "data", "createdAt"],
    order: [["createdAt", "DESC"]],
    limit: 100,
  });
  const duplicatedRequest = existingRequests.find((requestItem) => {
    const existedBookingId = Number(requestItem?.data?.bookingId || 0);
    return existedBookingId === Number(booking.id);
  });
  if (duplicatedRequest) {
    const duplicatedStatus = String(duplicatedRequest.status || "").toUpperCase();
    const err = new Error(
      duplicatedStatus === "APPROVED"
        ? "Khung giờ này đã được duyệt báo bận, không thể gửi lại"
        : "Bạn đã gửi yêu cầu báo bận cho khung giờ này và đang chờ duyệt"
    );
    err.statusCode = 409;
    throw err;
  }

  const requestContent = `Huấn luyện viên báo bận buổi ${dateLabel} (${timeLabel}) tại ${gymLabel}.`;
  const createdRequest = await Request.create({
    requesterId: userId,
    requestType: "BUSY_SLOT",
    status: "PENDING",
    reason: reasonText || null,
    data: {
      bookingId: booking.id,
      gymId: booking.gymId,
      trainerId: trainer.id,
      memberId: booking.memberId || null,
      packageActivationId: booking.packageActivationId || null,
      packageId: booking.packageId || booking?.Package?.id || null,
      packageName: booking?.Package?.name || null,
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      content: requestContent,
    },
  });

  const currentNotes = String(booking.notes || "");
  if (!currentNotes.includes(BUSY_REQUEST_NOTE_MARKER)) {
    const busyNote = `${BUSY_REQUEST_NOTE_MARKER} Huấn luyện viên báo bận lúc ${new Date().toISOString()}`;
    booking.notes = currentNotes ? `${currentNotes}\n${busyNote}` : busyNote;
    await booking.save();
  }

  await realtimeService.notifyUser(ownerId, {
    title: "Có yêu cầu báo bận khung giờ dạy",
    message: `${trainerLabel} báo bận buổi ${dateLabel} (${timeLabel}) tại ${gymLabel} - ${memberLabel}.${reasonText ? ` Lý do: ${reasonText}` : ""}`,
    notificationType: "trainer_request",
    relatedType: "request",
    relatedId: createdRequest.id,
  });

  realtimeService.emitGym(booking.gymId, "trainer:busy-slot-requested", {
    bookingId: booking.id,
    trainerId: trainer.id,
    memberId: booking.memberId || null,
    gymId: booking.gymId,
    bookingDate: booking.bookingDate,
    startTime: booking.startTime,
    endTime: booking.endTime,
    reason: reasonText || null,
  });

  return {
    success: true,
    message: "Đã gửi yêu cầu báo bận cho chủ phòng tập",
    requestId: createdRequest.id,
  };
};

module.exports = { getMyScheduleForDate, checkIn, checkOut, resetAttendance, requestBusySlot };