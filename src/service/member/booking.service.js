import db from "../../models";
import { Op } from "sequelize";
import payosService from "../payment/payos.service";
import realtimeService from "../realtime.service";
import membershipCardService from "./membershipCard.service";

const SLOT_MINUTES = 60;
const MIN_BOOKING_LEAD_MINUTES = 120;

const formatDateVN = (value) => {
  if (!value) return "ngày đã chọn";
  const s = String(value);
  const exact = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (exact) return `${exact[3]}/${exact[2]}/${exact[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "ngày đã chọn";
  return d.toLocaleDateString("vi-VN");
};

const toHHMMLabel = (value) => String(value || "").slice(0, 5);

const formatBookingNotificationSlot = ({ bookingDate, startTime, endTime }) =>
  `${formatDateVN(bookingDate)}${startTime && endTime ? ` (${toHHMMLabel(startTime)}-${toHHMMLabel(endTime)})` : ""}`;
const ALLOWED_PAYMENT = new Set(["payos"]);

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/* ================= BASIC UTILS ================= */

const timeToMinutes = (t) => {
  const s = String(t || "").slice(0, 5);
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

const minutesToTime = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;

const toHHMM = (t) => String(t || "").slice(0, 5);

const safeNotifyTrainerBooking = async ({ trainerId, title, message, relatedId = null }) => {
  try {
    const trainer = await db.Trainer.findByPk(trainerId, { attributes: ["id", "userId"] });
    if (!trainer?.userId) return;
    await realtimeService.notifyUser(trainer.userId, {
      title: title || "Lịch tập mới",
      message: message || "Bạn có lịch tập mới từ học viên.",
      notificationType: "booking_update",
      relatedType: "booking",
      relatedId,
    });
  } catch (e) {
    console.error("[member/booking.service] notify trainer booking error:", e?.message || e);
  }
};

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

const toISODate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const normalizeTimeInput = (startTime) => {
  const st = String(startTime || "");
  if (/^\d{2}:\d{2}$/.test(st)) return `${st}:00`;
  return st;
};

const getDateDow = (isoDate) => {
  return new Date(`${isoDate}T00:00:00`).getDay();
};

const genCode = (prefix = "TX") =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const genMembershipNumber = () =>
  `MEM${Date.now()}${Math.floor(Math.random() * 1000)}`;

const overlap = (aStart, aEnd, bStart, bEnd) =>
  aStart < bEnd && bStart < aEnd;

const isPackageActive = (pkg) => {
  if (!pkg) return false;
  const status = String(pkg.status || "").trim().toLowerCase();
  if (status && status !== "active") return false;
  return pkg.isActive !== false;
};

/* ================= BUSINESS HELPERS ================= */

function trainerMatchPackage(trainer, pkg) {
  if (!pkg?.type || pkg.type === "basic") return true;
  if (!trainer.specialization) return false;

  const specs = Array.isArray(trainer.specialization)
    ? trainer.specialization
    : String(trainer.specialization)
        .split(",")
        .map((s) => s.trim().toLowerCase());

  return specs.includes(String(pkg.type).trim().toLowerCase());
}

function getTrainerHoursForDate(trainer, isoDate) {
  const availableHours = safeParseJSON(trainer.availableHours, {});
  const dayKey = DAY_KEYS[getDateDow(isoDate)];
  return Array.isArray(availableHours?.[dayKey]) ? availableHours[dayKey] : [];
}

function slotFitsHours(hours, startTime, endTime) {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);

  return hours.some((h) => {
    const hs = timeToMinutes(h.start);
    const he = timeToMinutes(h.end);
    return s >= hs && e <= he;
  });
}

function generatePatternDatesFromStart({ startDate, pattern, totalSessions }) {
  const out = [];
  const d = new Date(`${startDate}T00:00:00`);
  let safe = 0;

  while (out.length < totalSessions && safe < 500) {
    safe += 1;

    if (pattern.includes(d.getDay())) {
      out.push(toISODate(d));
    }

    d.setDate(d.getDate() + 1);
  }

  return out;
}

function buildDaySlotSet(hours) {
  const set = new Set();

  for (const h of hours || []) {
    let s = timeToMinutes(h.start);
    const end = timeToMinutes(h.end);

    while (s + SLOT_MINUTES <= end) {
      const e = s + SLOT_MINUTES;
      set.add(
        `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}-${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`
      );
      s += SLOT_MINUTES;
    }
  }

  return set;
}

function intersectSlotSets(slotSets = []) {
  if (!slotSets.length) return [];

  let intersection = [...slotSets[0]];
  for (let i = 1; i < slotSets.length; i++) {
    intersection = intersection.filter((slotKey) => slotSets[i].has(slotKey));
  }
  return intersection;
}

function groupBookingsByDate(rows = []) {
  const map = new Map();

  for (const row of rows) {
    const date = String(row.bookingDate).slice(0, 10);
    if (!map.has(date)) map.set(date, []);
    map.get(date).push({
      start: timeToMinutes(row.startTime),
      end: timeToMinutes(row.endTime),
    });
  }

  return map;
}

function hasConflictInMap(dateMap, bookingDate, startTime, endTime) {
  const list = dateMap.get(bookingDate) || [];
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  return list.some((it) => overlap(s, e, it.start, it.end));
}


const RESCHEDULE_DAY_LABELS = {
  sunday: 'Chủ nhật',
  monday: 'Thứ 2',
  tuesday: 'Thứ 3',
  wednesday: 'Thứ 4',
  thursday: 'Thứ 5',
  friday: 'Thứ 6',
  saturday: 'Thứ 7',
};

const addMinutesToTime = (startTime, minutes) => minutesToTime(timeToMinutes(startTime) + minutes);

const normalizeWeekday = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const idx = Number(value);
    if (idx >= 0 && idx <= 6) return DAY_KEYS[idx];
  }
  const raw = String(value).trim().toLowerCase();
  const alias = {
    '2': 'monday', '3': 'tuesday', '4': 'wednesday', '5': 'thursday', '6': 'friday', '7': 'saturday',
    'cn': 'sunday', 'chunhat': 'sunday', 'chủ nhật': 'sunday', 'chu nhat': 'sunday',
    'thứ 2': 'monday', 'thu 2': 'monday', 'monday': 'monday',
    'thứ 3': 'tuesday', 'thu 3': 'tuesday', 'tuesday': 'tuesday',
    'thứ 4': 'wednesday', 'thu 4': 'wednesday', 'wednesday': 'wednesday',
    'thứ 5': 'thursday', 'thu 5': 'thursday', 'thursday': 'thursday',
    'thứ 6': 'friday', 'thu 6': 'friday', 'friday': 'friday',
    'thứ 7': 'saturday', 'thu 7': 'saturday', 'saturday': 'saturday',
    'sunday': 'sunday',
  };
  return alias[raw] || null;
};

const formatYMDLabel = (isoDate) => {
  const [y, m, d] = String(isoDate || '').split('-');
  if (!y || !m || !d) return isoDate;
  const date = new Date(`${isoDate}T00:00:00`);
  const key = DAY_KEYS[date.getDay()];
  return `${RESCHEDULE_DAY_LABELS[key] || ''}, ${d}/${m}/${y}`;
};

async function getOwnedBookingOrThrow(userId, bookingId, transaction) {
  const booking = await db.Booking.findByPk(bookingId, {
    include: [
      {
        model: db.Trainer,
        include: [{ model: db.User, attributes: ['id', 'username', 'email'] }],
      },
      {
        model: db.Member,
        include: [{ model: db.User, attributes: ['id', 'username', 'email'] }],
      },
      { model: db.Package, attributes: ['id', 'name', 'type'] },
      { model: db.Gym, attributes: ['id', 'name'] },
    ],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (!booking) {
    const e = new Error('Không tìm thấy booking');
    e.statusCode = 404;
    throw e;
  }

  if (Number(booking.createdBy) !== Number(userId)) {
    const e = new Error('Bạn không có quyền thao tác booking này');
    e.statusCode = 403;
    throw e;
  }

  const status = String(booking.status || '').toLowerCase();
  if (['cancelled', 'completed', 'no_show'].includes(status)) {
    const e = new Error('Booking hiện không thể đổi lịch');
    e.statusCode = 400;
    throw e;
  }

  const startMs = new Date(`${booking.bookingDate}T${toHHMM(booking.startTime)}:00`).getTime();
  if (Number.isFinite(startMs) && startMs <= Date.now()) {
    const e = new Error('Chỉ có thể đổi lịch cho buổi tập trong tương lai');
    e.statusCode = 400;
    throw e;
  }

  return booking;
}

async function buildRescheduleOptionsForBooking(booking, { selectedDate = null, weekday = null, daysAhead = 21 } = {}, transaction) {
  const trainer = booking.Trainer;
  if (!trainer) {
    const e = new Error('Booking chưa có PT để đổi lịch');
    e.statusCode = 400;
    throw e;
  }

  const pending = await db.BookingRescheduleRequest.findOne({
    where: { bookingId: booking.id, status: 'pending' },
    transaction,
  });
  if (pending) {
    const e = new Error('Booking này đang có yêu cầu đổi lịch chờ xử lý');
    e.statusCode = 400;
    throw e;
  }

  const normalizedWeekday = normalizeWeekday(weekday);
  if (weekday && !normalizedWeekday) {
    const e = new Error('Thứ trong tuần không hợp lệ');
    e.statusCode = 400;
    throw e;
  }

  const noticeHours = Math.max(Number(trainer.minBookingNotice || 0), 12);
  const minAllowedMs = Date.now() + noticeHours * 60 * 60 * 1000;

  const candidateDates = [];
  for (let i = 0; i <= daysAhead; i += 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const isoDate = toISODate(d);
    const dayKey = DAY_KEYS[d.getDay()];
    if (normalizedWeekday && normalizedWeekday !== dayKey) continue;
    const hours = getTrainerHoursForDate(trainer, isoDate);
    if (!Array.isArray(hours) || !hours.length) continue;
    const dateStartMs = new Date(`${isoDate}T00:00:00`).getTime();
    if (dateStartMs + 24 * 60 * 60 * 1000 <= minAllowedMs) continue;
    candidateDates.push({ date: isoDate, weekday: dayKey, label: formatYMDLabel(isoDate) });
  }

  let effectiveDate = selectedDate || candidateDates?.[0]?.date || null;
  if (selectedDate && !candidateDates.some((it) => it.date === selectedDate)) {
    const e = new Error('Ngày yêu cầu đổi lịch không nằm trong danh sách khả dụng');
    e.statusCode = 400;
    throw e;
  }

  let slots = [];
  if (effectiveDate) {
    const hours = getTrainerHoursForDate(trainer, effectiveDate);
    const slotKeys = [...buildDaySlotSet(hours)];
    const trainerBookings = await db.Booking.findAll({
      where: {
        trainerId: booking.trainerId,
        bookingDate: effectiveDate,
        status: { [Op.ne]: 'cancelled' },
        id: { [Op.ne]: booking.id },
      },
      attributes: ['startTime', 'endTime'],
      transaction,
    });
    const memberBookings = await db.Booking.findAll({
      where: {
        createdBy: booking.createdBy,
        bookingDate: effectiveDate,
        status: { [Op.ne]: 'cancelled' },
        id: { [Op.ne]: booking.id },
      },
      attributes: ['startTime', 'endTime'],
      transaction,
    });

    slots = slotKeys.map((slotKey) => {
      const [start, end] = slotKey.split('-');
      const startTime = `${start}:00`;
      const endTime = `${end}:00`;
      const startMs = new Date(`${effectiveDate}T${start}:00`).getTime();
      const trainerBusy = trainerBookings.some((b) => overlap(timeToMinutes(startTime), timeToMinutes(endTime), timeToMinutes(b.startTime), timeToMinutes(b.endTime)));
      const memberBusy = memberBookings.some((b) => overlap(timeToMinutes(startTime), timeToMinutes(endTime), timeToMinutes(b.startTime), timeToMinutes(b.endTime)));
      const tooSoon = startMs < minAllowedMs;
      return {
        startTime,
        endTime,
        label: `${start} - ${end}`,
        available: !trainerBusy && !memberBusy && !tooSoon,
        disabledReason: tooSoon ? 'Quá gần giờ tập' : trainerBusy ? 'PT đã có lịch khác' : memberBusy ? 'Bạn đã có lịch khác' : null,
      };
    }).filter((it) => it.available);
  }

  return {
    bookingId: booking.id,
    currentBooking: {
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
    },
    weekday: normalizedWeekday,
    selectedDate: effectiveDate,
    availableDates: candidateDates,
    availableSlots: slots,
    minNoticeHours: noticeHours,
  };
}

/* ================= DB HELPERS ================= */

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
  return db.Booking.count({
    where: {
      packageActivationId: activationId,
      status: { [Op.ne]: "cancelled" },
    },
    transaction,
  });
}

async function countCompleted(activationId, transaction) {
  return db.Booking.count({
    where: {
      packageActivationId: activationId,
      status: "completed",
    },
    transaction,
  });
}

async function syncActivationCounters(activation, transaction) {
  const total = Number(activation.totalSessions ?? activation.Package?.sessions ?? 0) || 0;
  const done = await countCompleted(activation.id, transaction);
  const remaining = Math.max(0, total - done);

  try {
    await activation.update(
      { sessionsUsed: done, sessionsRemaining: remaining, totalSessions: total },
      { transaction }
    );
  } catch {}

  return { total, done, remaining };
}

export async function syncPackageActivationCountersByActivationId(activationId, transaction = null) {
  if (!activationId) return null;
  const activation = await db.PackageActivation.findByPk(activationId, {
    include: [{ model: db.Package, attributes: ["id", "sessions"] }],
    transaction,
  });
  if (!activation) return null;
  return syncActivationCounters(activation, transaction);
}

async function ensureMemberForGym({ userId, gymId, transaction }) {
  let member = await db.Member.findOne({ where: { userId, gymId }, transaction });

  if (!member) {
    member = await db.Member.create(
      {
        userId,
        gymId,
        membershipNumber: genMembershipNumber(),
        status: "active",
        joinDate: new Date(),
      },
      { transaction }
    );
  } else if (!member.membershipNumber) {
    await member.update(
      { membershipNumber: genMembershipNumber() },
      { transaction }
    );
  }

  return member;
}

async function findActiveSamePackageWarning(userId, packageId, gymId, transaction) {
  const activations = await db.PackageActivation.findAll({
    where: {
      packageId,
      status: "active",
    },
    include: [
      {
        model: db.Member,
        attributes: ["id", "userId", "gymId"],
        where: { userId, gymId },
      },
      {
        model: db.Package,
        attributes: ["id", "sessions"],
      },
    ],
    transaction,
  });

  for (const a of activations) {
    const total = Number(a.totalSessions ?? a.Package?.sessions ?? 0) || 0;
    const done = Number(a.sessionsUsed || 0);
    const remaining = Math.max(0, Number(a.sessionsRemaining ?? total - done));

    if (remaining > 0) {
      return {
        hasActiveSamePackage: true,
        activationId: a.id,
        remainingSessions: remaining,
      };
    }
  }

  return {
    hasActiveSamePackage: false,
    activationId: null,
    remainingSessions: 0,
  };
}

async function hasTrainerConflict(trainerId, gymId, bookingDate, startTime, endTime, transaction) {
  const existed = await db.Booking.findOne({
    where: {
      trainerId,
      gymId,
      bookingDate,
      status: { [Op.notIn]: ["cancelled"] },
      [Op.and]: [
        { startTime: { [Op.lt]: endTime } },
        { endTime: { [Op.gt]: startTime } },
      ],
    },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  return !!existed;
}

async function hasMemberConflict(userId, bookingDate, startTime, endTime, transaction) {
  const existed = await db.Booking.findOne({
    where: {
      createdBy: userId,
      bookingDate,
      status: { [Op.notIn]: ["cancelled"] },
      [Op.and]: [
        { startTime: { [Op.lt]: endTime } },
        { endTime: { [Op.gt]: startTime } },
      ],
    },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  return !!existed;
}

/* ================= FAST PLAN VALIDATION ================= */

async function buildValidatedFixedPlan(userId, payload, transaction = null) {
  const packageId = Number(payload?.packageId);
  const trainerId = Number(payload?.trainerId);
  const startDate = String(payload?.startDate || "");
  const pattern = Array.isArray(payload?.pattern) ? payload.pattern : [];

  if (!packageId || !trainerId) {
    const e = new Error("Thiếu packageId hoặc trainerId");
    e.statusCode = 400;
    throw e;
  }

  assertDateOnly(startDate);

  const normalizedPattern = pattern
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x >= 0 && x <= 6)
    .sort((a, b) => a - b);

  if (!normalizedPattern.length) {
    const e = new Error("Pattern không hợp lệ");
    e.statusCode = 400;
    throw e;
  }

  if (!normalizedPattern.includes(getDateDow(startDate))) {
    const e = new Error("Ngày bắt đầu phải thuộc pattern đã chọn");
    e.statusCode = 400;
    throw e;
  }

  const pkg = await db.Package.findByPk(packageId, { transaction });
  if (!isPackageActive(pkg)) {
    const e = new Error("Gói tập không tồn tại hoặc đã ngừng hoạt động");
    e.statusCode = 404;
    throw e;
  }

  const trainer = await db.Trainer.findByPk(trainerId, {
    include: [{ model: db.User, attributes: ["id", "username"] }],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (!trainer || !trainer.isActive) {
    const e = new Error("Trainer không tồn tại hoặc đã bị khóa");
    e.statusCode = 404;
    throw e;
  }

  if (Number(trainer.gymId) !== Number(pkg.gymId)) {
    const e = new Error("Trainer không thuộc gym của gói");
    e.statusCode = 400;
    throw e;
  }

  if (!trainerMatchPackage(trainer, pkg)) {
    const e = new Error("Trainer không phù hợp với loại gói");
    e.statusCode = 400;
    throw e;
  }

  const totalSessions = Number(pkg.sessions || 0);
  if (totalSessions <= 0) {
    const e = new Error("Gói không có số buổi hợp lệ");
    e.statusCode = 400;
    throw e;
  }

  const bookingDates = generatePatternDatesFromStart({
    startDate,
    pattern: normalizedPattern,
    totalSessions,
  });

  if (!bookingDates.length) {
    const e = new Error("Không thể sinh lịch từ pattern đã chọn");
    e.statusCode = 400;
    throw e;
  }

  const now = new Date();
  const today00 = new Date();
  today00.setHours(0, 0, 0, 0);

  for (const d of bookingDates) {
    const dayStart = new Date(`${d}T00:00:00`);
    if (dayStart < today00) {
      const e = new Error("Lịch chứa ngày trong quá khứ");
      e.statusCode = 400;
      throw e;
    }
  }

  const slotSets = [];
  for (const bookingDate of bookingDates) {
    const hours = getTrainerHoursForDate(trainer, bookingDate);
    if (!hours.length) {
      slotSets.push(new Set());
      continue;
    }
    slotSets.push(buildDaySlotSet(hours));
  }

  const candidateSlotKeys = intersectSlotSets(slotSets);
  const warning = await findActiveSamePackageWarning(userId, pkg.id, pkg.gymId, transaction);

  if (!candidateSlotKeys.length) {
    return {
      package: pkg,
      trainer,
      pattern: normalizedPattern,
      startDate,
      totalSessions,
      bookingDates,
      slots: [],
      warning,
    };
  }

  const minDate = bookingDates[0];
  const maxDate = bookingDates[bookingDates.length - 1];

  const [trainerBookings, memberBookings] = await Promise.all([
    db.Booking.findAll({
      where: {
        trainerId: trainer.id,
        gymId: pkg.gymId,
        bookingDate: { [Op.between]: [minDate, maxDate] },
        status: { [Op.notIn]: ["cancelled"] },
      },
      attributes: ["bookingDate", "startTime", "endTime"],
      transaction,
    }),
    db.Booking.findAll({
      where: {
        createdBy: userId,
        bookingDate: { [Op.between]: [minDate, maxDate] },
        status: { [Op.notIn]: ["cancelled"] },
      },
      attributes: ["bookingDate", "startTime", "endTime"],
      transaction,
    }),
  ]);

  const trainerMap = groupBookingsByDate(trainerBookings);
  const memberMap = groupBookingsByDate(memberBookings);

  const validSlots = [];

  for (const key of candidateSlotKeys) {
    const [startHHMM, endHHMM] = key.split("-");
    const startTime = `${startHHMM}:00`;
    const endTime = `${endHHMM}:00`;

    let ok = true;

    for (const bookingDate of bookingDates) {
      const dateTime = new Date(`${bookingDate}T${startTime}`);
      if (dateTime.getTime() - now.getTime() < MIN_BOOKING_LEAD_MINUTES * 60 * 1000) {
        ok = false;
        break;
      }

      if (hasConflictInMap(trainerMap, bookingDate, startTime, endTime)) {
        ok = false;
        break;
      }

      if (hasConflictInMap(memberMap, bookingDate, startTime, endTime)) {
        ok = false;
        break;
      }
    }

    if (ok) {
      validSlots.push({
        start: startHHMM,
        end: endHHMM,
      });
    }
  }

  return {
    package: pkg,
    trainer,
    pattern: normalizedPattern,
    startDate,
    totalSessions,
    bookingDates,
    slots: validSlots.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start)),
    warning,
  };
}

/* ================= SERVICE ================= */

const bookingService = {
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
      },
      trainers: trainers.filter((t) => trainerMatchPackage(t, pkg)),
    };
  },

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

    const dayKey = DAY_KEYS[new Date(`${date}T00:00:00`).getDay()];
    const availableHours = safeParseJSON(trainer.availableHours, {});
    const hours = availableHours?.[dayKey] || [];
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
    const todayLocal = new Date();
    todayLocal.setHours(0, 0, 0, 0);
    const isToday = new Date(`${date}T00:00:00`).getTime() === todayLocal.getTime();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const slots = [];
    for (const h of hours) {
      let s = timeToMinutes(h.start);
      const end = timeToMinutes(h.end);

      while (s + SLOT_MINUTES <= end) {
        const e = s + SLOT_MINUTES;

        if (isToday && s < nowMinutes + MIN_BOOKING_LEAD_MINUTES) {
          s += SLOT_MINUTES;
          continue;
        }

        const isBusy = busy.some((b) => b.s < e && b.e > s);
        if (!isBusy) {
          slots.push({
            startTime: minutesToTime(s),
            endTime: minutesToTime(e),
          });
        }
        s += SLOT_MINUTES;
      }
    }

    return slots;
  },

  async getFixedPlanOptions(userId, payload) {
    const plan = await buildValidatedFixedPlan(userId, payload);

    return {
      warning: plan.warning,
      slots: plan.slots,
      bookingDates: plan.bookingDates,
      totalSessions: plan.totalSessions,
      package: {
        id: plan.package.id,
        name: plan.package.name,
        price: plan.package.price,
        sessions: plan.package.sessions,
      },
      trainer: {
        id: plan.trainer.id,
        username: plan.trainer?.User?.username || "PT",
      },
    };
  },

  async confirmFixedPlan(userId, payload) {
    const paymentMethod = String(payload?.paymentMethod || "payos").toLowerCase();
    if (!ALLOWED_PAYMENT.has(paymentMethod)) {
      const e = new Error("paymentMethod không hợp lệ. Flow này chỉ hỗ trợ PayOS.");
      e.statusCode = 400;
      throw e;
    }

    const selectedStartTime = normalizeTimeInput(payload?.startTime);
    if (!selectedStartTime) {
      const e = new Error("Thiếu startTime");
      e.statusCode = 400;
      throw e;
    }

    const t = await db.sequelize.transaction();

    try {
      const plan = await buildValidatedFixedPlan(userId, payload, t);
      const isPayOS = paymentMethod === "payos";
      const member = await ensureMemberForGym({
        userId,
        gymId: plan.package.gymId,
        transaction: t,
      });
      const membershipDecision = await membershipCardService.resolvePlanForPackagePurchase({
        memberId: member.id,
        gymId: plan.package.gymId,
        payload,
        transaction: t,
      });
      const membershipPlan = membershipDecision.plan;
      const packageAmount = Number(plan.package.price || 0);
      const membershipAmount = Number(membershipDecision.additionalAmount || 0);
      const totalAmount = packageAmount + membershipAmount;

      const selectedSlot = plan.slots.find((s) => `${s.start}:00` === selectedStartTime);
      if (!selectedSlot) {
        const e = new Error("Khung giờ đã chọn không còn hợp lệ");
        e.statusCode = 409;
        throw e;
      }

      if (plan.warning?.hasActiveSamePackage && !payload?.confirmDuplicate) {
        const e = new Error(
          `Bạn đang còn ${plan.warning.remainingSessions} buổi của gói này chưa dùng hết. Hãy xác nhận nếu vẫn muốn mua thêm.`
        );
        e.statusCode = 409;
        throw e;
      }

      const tx = await db.Transaction.create(
        {
          transactionCode: genCode("PKG"),
          memberId: member.id,
          trainerId: plan.trainer.id,
          gymId: plan.package.gymId,
          packageId: plan.package.id,
          amount: packageAmount,
          transactionType: "package_purchase",
          paymentMethod,
          paymentStatus: isPayOS ? "pending" : "completed",
          description: isPayOS
            ? membershipDecision.requireCardPurchase
              ? `Thanh toán gói + thẻ thành viên + lịch cố định (PayOS): ${plan.package.name}`
              : `Thanh toán gói + lịch cố định (đã có thẻ còn hạn): ${plan.package.name}`
            : membershipDecision.requireCardPurchase
              ? `Mua gói + thẻ thành viên + đặt lịch cố định: ${plan.package.name}`
              : `Mua gói + lịch cố định (đã có thẻ còn hạn): ${plan.package.name}`,
          ...(isPayOS ? {} : { transactionDate: new Date() }),
          processedBy: userId,
          metadata: membershipDecision.requireCardPurchase
            ? {
                membershipCard: {
                  planId: membershipPlan.id,
                  planCode: membershipPlan.code,
                  planMonths: membershipPlan.months,
                  planPrice: membershipPlan.price,
                },
              }
            : {},
        },
        { transaction: t }
      );
      let membershipTx = null;
      if (membershipDecision.requireCardPurchase) {
        membershipTx = await db.Transaction.create(
          {
            transactionCode: genCode("MCB"),
            memberId: member.id,
            gymId: plan.package.gymId,
            amount: membershipAmount,
            transactionType: "membership_card_purchase",
            paymentMethod,
            paymentStatus: isPayOS ? "pending" : "completed",
            description: isPayOS
              ? `Thanh toán thẻ thành viên kèm gói (PayOS): ${plan.package.name}`
              : `Mua thẻ thành viên kèm gói: ${plan.package.name}`,
            ...(isPayOS ? {} : { transactionDate: new Date() }),
            processedBy: userId,
            metadata: {
              membershipCard: {
                planId: membershipPlan.id,
                planCode: membershipPlan.code,
                planMonths: membershipPlan.months,
                planPrice: membershipPlan.price,
              },
              bundle: {
                source: "package_bundle",
                packageTransactionId: tx.id,
              },
            },
          },
          { transaction: t }
        );
      }

      let payosCheckoutUrl = null;
      if (isPayOS) {
        const frontendBase = process.env.FRONTEND_URL || "http://localhost:3000";
        const payosResp = await payosService.createPackagePaymentLink({
          orderCode: tx.id,
          amount: totalAmount,
          description: membershipDecision.requireCardPurchase
            ? `Thanh toán gói ${plan.package.name} + thẻ thành viên`
            : `Thanh toán gói ${plan.package.name} (đã có thẻ còn hạn)`,
          returnUrl: `${frontendBase}/member/payment-success?payos=success&orderCode=${encodeURIComponent(tx.id)}`,
          cancelUrl: `${frontendBase}/member/payment-success?payos=cancel&orderCode=${encodeURIComponent(tx.id)}`,
        });
        payosCheckoutUrl = payosResp.checkoutUrl || null;

        await tx.update(
          {
            metadata: {
              ...(tx.metadata || {}),
              bundle: membershipTx
                ? {
                    membershipTransactionId: membershipTx.id,
                    packageAmount,
                    membershipAmount,
                    totalAmount,
                  }
                : undefined,
              payos: {
                orderCode: payosResp.orderCode,
                checkoutUrl: payosResp.checkoutUrl,
                paymentLinkId: payosResp.paymentLinkId,
              },
            },
          },
          { transaction: t }
        );
      }

      let expiryDate = null;
      if (plan.package.durationDays && plan.package.durationDays > 0) {
        expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + plan.package.durationDays);
      }

      const activation = await db.PackageActivation.create(
        {
          memberId: member.id,
          packageId: plan.package.id,
          transactionId: tx.id,
          activationDate: new Date(),
          expiryDate,
          totalSessions: plan.package.sessions,
          sessionsUsed: 0,
          sessionsRemaining: plan.package.sessions,
          pricePerSession: plan.package.sessions
            ? Number(plan.package.price) / Number(plan.package.sessions)
            : null,
          status: "active",
        },
        { transaction: t }
      );

      await tx.update({ packageActivationId: activation.id }, { transaction: t });
      if (membershipDecision.requireCardPurchase) {
        await membershipCardService.createOrExtendMembershipCard({
          memberId: member.id,
          gymId: plan.package.gymId,
          plan: membershipPlan,
          transactionId: membershipTx?.id || tx.id,
          purchaseSource: "package_bundle",
          transaction: t,
        });
        if (membershipTx) {
          await tx.update(
            {
              metadata: {
                ...(tx.metadata || {}),
                bundle: {
                  membershipTransactionId: membershipTx.id,
                  packageAmount,
                  membershipAmount,
                  totalAmount,
                },
              },
            },
            { transaction: t }
          );
        }
      }

      const startTimeFixed = `${selectedSlot.start}:00`;
      const endTime = `${selectedSlot.end}:00`;

      const conflictChecks = await Promise.all(
        plan.bookingDates.map(async (bookingDate) => {
          const [trainerConflict, memberConflict] = await Promise.all([
            hasTrainerConflict(
              plan.trainer.id,
              plan.package.gymId,
              bookingDate,
              startTimeFixed,
              endTime,
              t
            ),
            hasMemberConflict(userId, bookingDate, startTimeFixed, endTime, t),
          ]);

          return { bookingDate, trainerConflict, memberConflict };
        })
      );

      const firstTrainerConflict = conflictChecks.find((x) => x.trainerConflict);
      if (firstTrainerConflict) {
        const e = new Error(
          `Trainer bị trùng lịch tại ${firstTrainerConflict.bookingDate} ${selectedSlot.start}-${selectedSlot.end}`
        );
        e.statusCode = 409;
        throw e;
      }

      const firstMemberConflict = conflictChecks.find((x) => x.memberConflict);
      if (firstMemberConflict) {
        const e = new Error(
          `Bạn đang có lịch trùng tại ${firstMemberConflict.bookingDate} ${selectedSlot.start}-${selectedSlot.end}`
        );
        e.statusCode = 409;
        throw e;
      }

      const bookingPayload = plan.bookingDates.map((bookingDate) => ({
        memberId: member.id,
        trainerId: plan.trainer.id,
        gymId: plan.package.gymId,
        packageId: plan.package.id,
        packageActivationId: activation.id,
        bookingDate,
        startTime: startTimeFixed,
        endTime,
        status: "confirmed",
        createdBy: userId,
      }));

      const created = await db.Booking.bulkCreate(bookingPayload, { transaction: t });

      await syncActivationCounters(activation, t);

      await t.commit();

      await safeNotifyTrainerBooking({
        trainerId: plan.trainer.id,
        title: "Bạn có lịch tập mới",
        message: `Học viên vừa đặt ${created.length} buổi (${selectedSlot.start}-${selectedSlot.end}).`,
        relatedId: created[0]?.id || null,
      });

      return {
        activation,
        createdCount: created.length,
        createdBookings: created.map((b) => ({
          id: b.id,
          bookingDate: b.bookingDate,
          startTime: toHHMM(b.startTime),
          endTime: toHHMM(b.endTime),
        })),
        paymentProvider: isPayOS ? "payos" : null,
        paymentUrl: isPayOS ? payosCheckoutUrl : null,
      };
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async createBooking(userId, { activationId, trainerId, date, startTime }) {
    const t = await db.sequelize.transaction();
    try {
      assertDateOnly(date);

      const activation = await getActivationOrThrow(userId, activationId, t);
      const gymId = activation.Member.gymId;

      const startTimeFixed = normalizeTimeInput(startTime);

      const total =
        Number(activation.totalSessions ?? activation.Package?.sessions ?? 0) || 0;

      if (total <= 0) {
        const e = new Error("Gói không có tổng số buổi hợp lệ");
        e.statusCode = 400;
        throw e;
      }

      const bookedCnt = await countBookedNotCancelled(activation.id, t);
      if (bookedCnt >= total) {
        const e = new Error("Bạn đã đặt đủ số buổi của gói. Hãy huỷ 1 buổi hoặc mua gói mới.");
        e.statusCode = 400;
        throw e;
      }

      const bookingDateTime = new Date(`${date}T${startTimeFixed}`);
      if (bookingDateTime <= new Date()) {
        const e = new Error("Không thể đặt lịch trong quá khứ");
        e.statusCode = 400;
        throw e;
      }

      const sMin = timeToMinutes(startTimeFixed);
      const eMin = sMin + SLOT_MINUTES;
      const endTime = minutesToTime(eMin);

      const trainerConflict = await hasTrainerConflict(
        trainerId,
        gymId,
        date,
        startTimeFixed,
        endTime,
        t
      );
      if (trainerConflict) {
        const e = new Error("Khung giờ đã được đặt");
        e.statusCode = 409;
        throw e;
      }

      const memberConflict = await hasMemberConflict(userId, date, startTimeFixed, endTime, t);
      if (memberConflict) {
        const e = new Error("Bạn đã có lịch khác trùng khung giờ này");
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
          bookingDate: date,
          startTime: startTimeFixed,
          endTime,
          status: "confirmed",
          createdBy: userId,
        },
        { transaction: t }
      );

      await t.commit();

      await safeNotifyTrainerBooking({
        trainerId,
        title: "Bạn có lịch tập mới",
        message: `Học viên vừa đặt lịch ngày ${date} (${toHHMM(startTimeFixed)}-${toHHMM(endTime)}).`,
        relatedId: booking?.id || null,
      });
      try {
        await realtimeService.notifyUser(userId, {
          title: "Đặt lịch thành công",
          message: `Bạn đã đặt buổi tập ngày ${formatBookingNotificationSlot(booking)} thành công.`,
          notificationType: "booking_update",
          relatedType: "booking",
          relatedId: booking.id,
        });
      } catch (notifyError) {
        console.error("[member.booking] create booking notify error:", notifyError.message);
      }
      return booking;
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async createWeekPatternBookings(userId, { activationId, trainerId, startDate, startTime, pattern }) {
    const t = await db.sequelize.transaction();

    try {
      assertDateOnly(startDate);

      if (!activationId || !trainerId || !startTime || !Array.isArray(pattern) || !pattern.length) {
        const e = new Error("Thiếu activationId, trainerId, startDate, startTime hoặc pattern");
        e.statusCode = 400;
        throw e;
      }

      const normalizedPattern = pattern
        .map((x) => Number(x))
        .filter((x) => Number.isInteger(x) && x >= 0 && x <= 6)
        .sort((a, b) => a - b);

      if (!normalizedPattern.length) {
        const e = new Error("Pattern không hợp lệ");
        e.statusCode = 400;
        throw e;
      }

      const activation = await getActivationOrThrow(userId, activationId, t);
      const gymId = activation.Member.gymId;

      const trainer = await db.Trainer.findOne({
        where: { id: trainerId, gymId, isActive: true },
        include: [{ model: db.User, attributes: ["username"] }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!trainer || !trainerMatchPackage(trainer, activation.Package)) {
        const e = new Error("Trainer không phù hợp gói tập");
        e.statusCode = 400;
        throw e;
      }

      const totalSessions =
        Number(activation.totalSessions ?? activation.Package?.sessions ?? 0) || 0;

      if (totalSessions <= 0) {
        const e = new Error("Gói không có tổng số buổi hợp lệ");
        e.statusCode = 400;
        throw e;
      }

      const usedSessions = await countBookedNotCancelled(activation.id, t);
      const remainingSessions = totalSessions - usedSessions;

      if (remainingSessions <= 0) {
        const e = new Error("Gói đã hết số buổi");
        e.statusCode = 400;
        throw e;
      }

      const startDay = getDateDow(startDate);
      if (!normalizedPattern.includes(startDay)) {
        const e = new Error("Ngày bắt đầu phải thuộc pattern đã chọn");
        e.statusCode = 400;
        throw e;
      }

      const startTimeFixed = normalizeTimeInput(startTime);
      const endTime = minutesToTime(timeToMinutes(startTimeFixed) + SLOT_MINUTES);

      const bookingDates = generatePatternDatesFromStart({
        startDate,
        pattern: normalizedPattern,
        totalSessions: remainingSessions,
      });

      const created = [];
      const skipped = [];

      for (const bookingDate of bookingDates) {
        const bookingDateTime = new Date(`${bookingDate}T${startTimeFixed}`);
        if (bookingDateTime <= new Date()) {
          skipped.push({ bookingDate, reason: "past_time" });
          continue;
        }

        const dayHours = getTrainerHoursForDate(trainer, bookingDate);
        if (!slotFitsHours(dayHours, startTimeFixed, endTime)) {
          skipped.push({ bookingDate, reason: "trainer_not_available" });
          continue;
        }

        const trainerConflict = await hasTrainerConflict(
          trainerId,
          gymId,
          bookingDate,
          startTimeFixed,
          endTime,
          t
        );

        if (trainerConflict) {
          skipped.push({ bookingDate, reason: "trainer_conflict" });
          continue;
        }

        const memberConflict = await hasMemberConflict(
          userId,
          bookingDate,
          startTimeFixed,
          endTime,
          t
        );

        if (memberConflict) {
          skipped.push({ bookingDate, reason: "member_conflict" });
          continue;
        }

        const row = await db.Booking.create(
          {
            memberId: activation.memberId,
            trainerId,
            gymId,
            packageId: activation.packageId,
            packageActivationId: activation.id,
            bookingDate,
            startTime: startTimeFixed,
            endTime,
            status: "confirmed",
            createdBy: userId,
          },
          { transaction: t }
        );

        created.push(row);
      }

      if (!created.length) {
        const e = new Error("Không có buổi nào được tạo. Hãy chọn ngày bắt đầu hoặc khung giờ khác.");
        e.statusCode = 400;
        throw e;
      }

      await t.commit();

      await safeNotifyTrainerBooking({
        trainerId,
        title: "Bạn có lịch tập mới",
        message: `Học viên vừa đặt ${created.length} buổi theo lịch lặp (${toHHMM(startTimeFixed)}-${toHHMM(endTime)}).`,
        relatedId: created[0]?.id || null,
      });
      try {
        await realtimeService.notifyUser(userId, {
          title: "Đã tạo lịch tập",
          message: created.length === 1
            ? `Bạn đã tạo 1 buổi tập vào ${formatBookingNotificationSlot(created[0])}.`
            : `Bạn đã tạo ${created.length} buổi tập mới cho gói của mình.`,
          notificationType: "booking_update",
          relatedType: "packageActivation",
          relatedId: activation.id,
        });
      } catch (notifyError) {
        console.error("[member.booking] create week bookings notify error:", notifyError.message);
      }

      return {
        createdCount: created.length,
        skippedCount: skipped.length,
        created,
        skipped,
      };
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },


async getMyRescheduleOptions(userId, bookingId, query = {}) {
  const booking = await getOwnedBookingOrThrow(userId, bookingId);
  return buildRescheduleOptionsForBooking(booking, {
    selectedDate: query.selectedDate || null,
    weekday: query.weekday || null,
    daysAhead: Number(query.daysAhead || 21),
  });
},

async createRescheduleRequest(userId, bookingId, payload = {}) {
  const t = await db.sequelize.transaction();
  try {
    const booking = await getOwnedBookingOrThrow(userId, bookingId, t);
    const requestedDate = String(payload.requestedDate || '').slice(0, 10);
    const requestedStartTime = normalizeTimeInput(payload.requestedStartTime || payload.startTime || '');
    const reason = String(payload.reason || '').trim();

    assertDateOnly(requestedDate);
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(requestedStartTime)) {
      const e = new Error('Giờ bắt đầu không hợp lệ');
      e.statusCode = 400;
      throw e;
    }

    const options = await buildRescheduleOptionsForBooking(booking, {
      selectedDate: requestedDate,
      weekday: payload.weekday || null,
    }, t);
    const slot = (options.availableSlots || []).find((it) => it.startTime === requestedStartTime);
    if (!slot) {
      const e = new Error('Khung giờ yêu cầu hiện không còn khả dụng');
      e.statusCode = 400;
      throw e;
    }

    const row = await db.BookingRescheduleRequest.create({
      bookingId: booking.id,
      memberId: booking.memberId,
      trainerId: booking.trainerId,
      requestedByUserId: userId,
      oldBookingDate: booking.bookingDate,
      oldStartTime: booking.startTime,
      oldEndTime: booking.endTime,
      requestedDate,
      requestedStartTime,
      requestedEndTime: slot.endTime,
      reason: reason || null,
      status: 'pending',
    }, { transaction: t });

    await t.commit();

    if (booking?.Trainer?.User?.id) {
      await realtimeService.notifyUser(Number(booking.Trainer.User.id), {
        title: 'Yêu cầu đổi lịch mới',
        message: `${booking.Member?.User?.username || 'Hội viên'} muốn đổi buổi ${formatYMDLabel(booking.bookingDate)} ${toHHMM(booking.startTime)} sang ${formatYMDLabel(requestedDate)} ${toHHMM(requestedStartTime)}.`,
        notificationType: 'booking_reschedule',
        relatedType: 'booking_reschedule_request',
        relatedId: row.id,
      });
    }

    return row;
  } catch (e) {
    await t.rollback();
    throw e;
  }
},

async getMyRescheduleRequests(userId) {
  const rows = await db.BookingRescheduleRequest.findAll({
    where: { requestedByUserId: userId },
    include: [
      {
        model: db.Booking,
        include: [
          { model: db.Package, attributes: ['id', 'name', 'type'] },
          { model: db.Gym, attributes: ['id', 'name'] },
        ],
      },
      {
        model: db.Trainer,
        include: [{ model: db.User, attributes: ['id', 'username', 'email'] }],
      },
    ],
    order: [['createdAt', 'DESC']],
  });
  return rows;
},

  async getMyBookings(userId) {
    const rows = await db.Booking.findAll({
      where: { createdBy: userId },
      include: [
        {
          model: db.Trainer,
          include: [{ model: db.User, attributes: ["id", "username", "email"] }],
        },
        {
          model: db.Member,
          include: [{ model: db.User, attributes: ["id", "username", "email"] }],
        },
        { model: db.Package, attributes: ["name", "type"] },
        { model: db.Gym, attributes: ["name"] },
      ],
      order: [["bookingDate", "ASC"], ["startTime", "ASC"]],
    });

    const bookingIds = rows.map((b) => b.id);
    let trainerAttendances = [];
    if (bookingIds.length && db.Attendance) {
      trainerAttendances = await db.Attendance.findAll({
        where: {
          bookingId: bookingIds,
          attendanceType: "trainer",
        },
        attributes: [
          "id",
          "bookingId",
          "status",
          "checkInTime",
          "checkOutTime",
          "method",
          "attendanceType",
        ],
      });
    }

    const attByBookingId = new Map();
    for (const a of trainerAttendances) {
      const plain = a.toJSON ? a.toJSON() : a;
      attByBookingId.set(plain.bookingId, plain);
    }

    const requests = bookingIds.length
      ? await db.BookingRescheduleRequest.findAll({
          where: { bookingId: { [Op.in]: bookingIds } },
          order: [['createdAt', 'DESC']],
        })
      : [];
    const reqMap = new Map();
    for (const r of requests) {
      const plain = r.toJSON ? r.toJSON() : r;
      if (!reqMap.has(plain.bookingId)) reqMap.set(plain.bookingId, []);
      reqMap.get(plain.bookingId).push(plain);
    }

    return rows.map((b) => {
      const plain = b.toJSON ? b.toJSON() : b;
      const reqs = reqMap.get(b.id) || [];
      return {
        ...plain,
        trainerAttendance: attByBookingId.get(b.id) || null,
        latestRescheduleRequest: reqs[0] || null,
        pendingRescheduleRequest: reqs.find((x) => x.status === 'pending') || null,
        rescheduleRequests: reqs,
      };
    });
  },
};

export default bookingService;