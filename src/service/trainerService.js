// services/trainerService.js
const db = require('../models');
const { Op } = require("sequelize");
// Sử dụng dòng này thay cho { Trainer, ... } cũ để tránh lệch tên model
const Trainer = db.trainer || db.Trainer; 
const { TrainerShare, SessionProgress, Booking, Member, Gym, User } = db;
const Package = db.Package || db.package;
const PackageActivation = db.PackageActivation || db.packageactivation;
const Attendance = db.Attendance || db.attendance;

const TRAINER_ATT_SAFE = [
  "id",
  "userId",
  "gymId",
  "bookingId",
  "checkInTime",
  "checkOutTime",
  "attendanceType",
  "method",
  "status",
  "createdAt",
  "updatedAt",
];
// ===== Hard rules for schedule slots =====
const SLOT_DURATION_MIN = 60;

const DAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const extractHHmm = (v) => {
  const s = String(v ?? "").trim();
  const m = s.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/); // lấy HH:MM trong chuỗi
  return m ? `${m[1]}:${m[2]}` : null;
};


const parseHHmmToMinutes = (hhmm) => {
  const cleaned = extractHHmm(hhmm);
  if (!cleaned) return null;
  const [h, m] = cleaned.split(":").map(Number);
  return h * 60 + m;
};

const minutesToHHmm = (mins) => {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
};


const   parseAvailableHoursFromDb = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value; // nếu DB type JSON
  if (typeof value === 'string') {
    try {
      return JSON.parse(value || '{}') || {};
    } catch {
      return {};
    }
  }
  return {};
};
const normalizeAvailableHours = (input) => {
  // ✅ accept both: schedule object OR { availableHours: schedule }
  const availableHours =
    input &&
    typeof input === "object" &&
    input.availableHours &&
    typeof input.availableHours === "object"
      ? input.availableHours
      : input;

  if (!availableHours) return {};
  if (typeof availableHours !== "object") return null;

  const days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];

  for (const d of Object.keys(availableHours)) {
    if (!days.includes(d)) return null;
    if (!Array.isArray(availableHours[d])) return null;

    for (const slot of availableHours[d]) {
      if (!slot || typeof slot !== "object") return null;

      const startHHmm = extractHHmm(slot.start);
      const endHHmm = extractHHmm(slot.end);
      if (!startHHmm || !endHHmm) return null;

      const s = parseHHmmToMinutes(startHHmm);
      const e = parseHHmmToMinutes(endHHmm);
      if (s === null || e === null) return null;
      if (e <= s) return null;

      // ✅ normalize về HH:MM để lưu DB sạch
      slot.start = startHHmm;
      slot.end = endHHmm;
    }
  }

  return availableHours;
};

const parseGymOperatingHours = (raw) => {
  if (!raw) return null;
  let obj = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const mf = obj.monFri || obj.mon_fri;
  const we = obj.weekend;
  if (!mf?.open || !mf?.close || !we?.open || !we?.close) return null;
  const oOpen = extractHHmm(mf.open);
  const oClose = extractHHmm(mf.close);
  const wOpen = extractHHmm(we.open);
  const wClose = extractHHmm(we.close);
  if (!oOpen || !oClose || !wOpen || !wClose) return null;
  const mo = parseHHmmToMinutes(oOpen);
  const mc = parseHHmmToMinutes(oClose);
  const wo = parseHHmmToMinutes(wOpen);
  const wc = parseHHmmToMinutes(wClose);
  if (mo === null || mc === null || wo === null || wc === null) return null;
  if (mc <= mo || wc <= wo) return null;
  return {
    monFri: { open: oOpen, close: oClose, openMin: mo, closeMin: mc },
    weekend: { open: wOpen, close: wClose, openMin: wo, closeMin: wc },
  };
};

const getGymWindowForDayKey = (dayKey, parsed) => {
  if (!parsed) return null;
  const monFriDays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  return monFriDays.includes(dayKey) ? parsed.monFri : parsed.weekend;
};

const validateAvailableHoursAgainstGym = (normalized, gym) => {
  if (!gym || gym.operatingHours == null || gym.operatingHours === "") return;
  const parsed = parseGymOperatingHours(gym.operatingHours);
  if (!parsed) return;
  const dayLabels = {
    monday: "Thứ 2",
    tuesday: "Thứ 3",
    wednesday: "Thứ 4",
    thursday: "Thứ 5",
    friday: "Thứ 6",
    saturday: "Thứ 7",
    sunday: "Chủ nhật",
  };
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  for (const d of days) {
    const win = getGymWindowForDayKey(d, parsed);
    if (!win) continue;
    for (const slot of normalized[d] || []) {
      const s = parseHHmmToMinutes(slot.start);
      const e = parseHHmmToMinutes(slot.end);
      if (s === null || e === null) continue;
      if (s < win.openMin || e > win.closeMin) {
        throw new Error(
          `${dayLabels[d]}: khung ${slot.start}–${slot.end} ngoài giờ mở cửa phòng gym (${win.open}–${win.close}).`
        );
      }
    }
  }
};

const getDayKeyFromDate = (dateValue) => {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  const dayIndex = d.getDay(); // 0..6
  return DAY_KEYS[dayIndex] || null;
};

const isRangeCoveredBySchedule = (dayRanges = [], startTime, endTime) => {
  const startMin = parseHHmmToMinutes(startTime);
  const endMin = parseHHmmToMinutes(endTime);
  if (startMin === null || endMin === null || endMin <= startMin) return false;

  for (const range of dayRanges) {
    const rs = parseHHmmToMinutes(range?.start);
    const re = parseHHmmToMinutes(range?.end);
    if (rs === null || re === null || re <= rs) continue;
    if (startMin >= rs && endMin <= re) return true;
  }
  return false;
};

const assertBookedSlotsStillCovered = async (trainerId, normalized) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bookings = await Booking.findAll({
    where: {
      trainerId,
      status: { [Op.notIn]: ["cancelled"] },
      bookingDate: { [Op.gte]: today },
    },
    attributes: ["id", "bookingDate", "startTime", "endTime", "status"],
    include: [
      {
        model: Member,
        required: false,
        include: [
          {
            model: User,
            as: "User",
            attributes: ["username"],
            required: false,
          },
        ],
      },
    ],
    order: [["bookingDate", "ASC"], ["startTime", "ASC"]],
  });

  const invalid = [];
  for (const b of bookings) {
    const dayKey = getDayKeyFromDate(b.bookingDate);
    if (!dayKey) continue;
    const dayRanges = normalized?.[dayKey] || [];
    const covered = isRangeCoveredBySchedule(dayRanges, b.startTime, b.endTime);
    if (!covered) {
      const dateLabel = new Date(b.bookingDate).toLocaleDateString("vi-VN");
      const studentName =
        b?.Member?.User?.username || b?.Member?.fullName || (b?.memberId ? `Học viên #${b.memberId}` : "Học viên");
      invalid.push({
        studentName,
        dateLabel,
        start: extractHHmm(b.startTime) || String(b.startTime || ""),
        end: extractHHmm(b.endTime) || String(b.endTime || ""),
      });
    }
  }

  if (invalid.length > 0) {
    throw new Error("Không thể cập nhật lịch rảnh vì trùng lịch có học viên.");
  }
};

const serializeAvailableHoursToDb = (obj) => {
  // Nếu DB bạn là JSON column thì có thể return obj luôn,
  // nhưng để đồng bộ mọi môi trường: stringify là an toàn nhất nếu column TEXT.
  return obj;
};


const generateSlotsFromRange = (startHHmm, endHHmm) => {
  const start = parseHHmmToMinutes(startHHmm);
  const end = parseHHmmToMinutes(endHHmm);
  if (start === null || end === null || end <= start) return [];

  const slots = [];
  let cur = start;

  // Cứ thế cộng 60 phút, không còn biến BREAK_DURATION_MIN nào ở đây
  while (cur + SLOT_DURATION_MIN <= end) {
    slots.push({
      start: minutesToHHmm(cur),
      end: minutesToHHmm(cur + SLOT_DURATION_MIN),
    });
    cur += SLOT_DURATION_MIN; // Bước nhảy đúng 60p
  }
  return slots;
};
// const generateSlotsForDayRanges = (ranges = []) => {
//   const all = [];
//   for (const r of ranges) {
//     all.push(...generateSlotsFromRange(r.start, r.end));
//   }
//   all.sort((a, b) => parseHHmmToMinutes(a.start) - parseHHmmToMinutes(b.start));
//   return all;
// };
const generateSlotsForDayRanges = (ranges = []) => {
  const all = [];
  for (const r of ranges) {
    all.push(...generateSlotsFromRange(r.start, r.end)); // Tạo slot theo giờ nguyên
  }
  all.sort((a, b) => parseHHmmToMinutes(a.start) - parseHHmmToMinutes(b.start)); // Sắp xếp lại các slot theo giờ
  return all;
};
const generateSlotsFromAvailableHours = (availableHours = {}) => {
  const slotsByDay = {};
  for (const day of DAY_KEYS) {
    slotsByDay[day] = generateSlotsForDayRanges(availableHours?.[day] || []);
  }
  return slotsByDay;
};

// ===== base service methods =====

// Lấy danh sách tất cả các huấn luyện viên
const getTrainers = async () => {
  try {
    return await Trainer.findAll();
  } catch (error) {
    throw new Error('Error fetching trainers');
  }
};

// Tạo mới một huấn luyện viên
const createTrainer = async (trainerData) => {
  try {
    return await Trainer.create(trainerData);
  } catch (error) {
    throw new Error('Error creating trainer');
  }
};

// Cập nhật thông tin huấn luyện viên
const updateTrainer = async (id, trainerData) => {
  try {
    const trainer = await Trainer.findByPk(id);
    if (!trainer) throw new Error('Trainer not found');
    await trainer.update(trainerData);
    return trainer;
  } catch (error) {
    throw new Error('Error updating trainer');
  }
};

// Lấy thông tin chi tiết huấn luyện viên
const getTrainerDetails = async (id) => {
  try {
    const pt = await Trainer.findByPk(id, {
      include: [TrainerShare, SessionProgress],
    });
    if (!pt) throw new Error('Trainer not found');
    return pt;
  } catch (error) {
    throw new Error('Error fetching trainer details');
  }
};

// ===== schedule methods =====

const getTrainerScheduleRaw = async (id) => {
  const pt = await Trainer.findByPk(id, { attributes: ['id', 'availableHours'] });
  if (!pt) throw new Error('Trainer not found');
  return pt.availableHours || {};
};

const getTrainerScheduleSlots = async (id) => {
  // Đảm bảo dùng Trainer (đã alias từ db.trainer ở bước 1)
  const pt = await Trainer.findByPk(id, { attributes: ['id', 'availableHours'] });
  
  // Nếu không thấy PT, trả về object rỗng thay vì throw Error gây lỗi 500
  if (!pt) {
    console.error(`[Service] Không tìm thấy Trainer ID: ${id}`);
    return {}; 
  }
  
  return generateSlotsFromAvailableHours(pt.availableHours || {});
};
// lấy cả raw + slots
const getTrainerScheduleBoth = async (id) => {
  const raw = await getTrainerScheduleRaw(id);
  const slots = generateSlotsFromAvailableHours(raw);
  return { availableHours: raw, slots };
};


const updateTrainerSchedule = async (id, scheduleData) => {
  try {
    const pt = await Trainer.findByPk(id);
    if (!pt) throw new Error('Trainer not found');

    const normalized = normalizeAvailableHours(scheduleData);
    if (normalized === null) throw new Error('availableHours format is invalid');

    if (pt.gymId && Gym) {
      const gym = await Gym.findByPk(pt.gymId, { attributes: ['id', 'operatingHours'] });
      validateAvailableHoursAgainstGym(normalized, gym);
    }

    await assertBookedSlotsStillCovered(id, normalized);

    pt.availableHours = normalized;
    await pt.save();

    return {
      availableHours: normalized,
      slots: generateSlotsFromAvailableHours(normalized),
    };
  } catch (error) {
    console.error("❌ Service Error:", error);
    throw new Error(error.message || 'Error updating schedule');
  }
};
// Cập nhật kỹ năng/chứng chỉ của huấn luyện viên
const updateTrainerSkills = async (id, skillsData) => {
  try {
    const pt = await Trainer.findByPk(id);
    if (!pt) throw new Error('Trainer not found');
    pt.specialization = skillsData.specialization;
    pt.certification = skillsData.certification;
    await pt.save();
    return pt;
  } catch (error) {
    throw new Error('Error updating skills');
  }
};
const getTrainerBookings = async (trainerId) => {
  try {
    const rows = await Booking.findAll({
      where: { trainerId },
      include: [
        {
          model: Member,
          include: [
            {
              model: User,
              as: "User",
              attributes: ["username", "email", "phone", "avatar"],
            },
          ],
        },
        {
          model: Gym,
          attributes: ["id", "name"],
        },
        ...(Package
          ? [
              {
                model: Package,
                attributes: ["id", "name", "sessions", "type"],
                required: false,
              },
            ]
          : []),
        ...(PackageActivation
          ? [
              {
                model: PackageActivation,
                attributes: [
                  "id",
                  "sessionsRemaining",
                  "totalSessions",
                  "sessionsUsed",
                  "status",
                ],
                required: false,
              },
            ]
          : []),
      ],
      order: [["createdAt", "DESC"]],
    });

    const trainer = await Trainer.findByPk(trainerId, { attributes: ["id", "userId"] });
    const userId = trainer?.userId;
    const bookingIds = rows.map((b) => b.id);

    let attByBookingId = new Map();
    if (Attendance && userId && bookingIds.length) {
      try {
        const atts = await Attendance.findAll({
          where: {
            bookingId: bookingIds,
            attendanceType: "trainer",
            userId,
          },
          attributes: TRAINER_ATT_SAFE,
        });
        attByBookingId = new Map(
          atts.map((a) => {
            const j = a.toJSON ? a.toJSON() : a;
            return [j.bookingId, j];
          })
        );
      } catch (e) {
        attByBookingId = new Map();
      }
    }

    return rows.map((b) => {
      const plain = b.toJSON ? b.toJSON() : b;
      return {
        ...plain,
        trainerAttendance: attByBookingId.get(b.id) || null,
      };
    });
  } catch (error) {
    console.error("❌ Lỗi Database Query:", error);
    throw error;
  }
};
const confirmBooking = async (bookingId) => {
  try {
    const booking = await Booking.findByPk(bookingId);
    if (!booking) throw new Error('Booking not found');
    booking.status = 'confirmed';
    await booking.save();
    return booking;
  } catch (error) {
    throw new Error('Error confirming booking');
  }
};


module.exports = {
  // existing
  getTrainers,
  createTrainer,
  updateTrainer,
  getTrainerDetails,
  updateTrainerSchedule,
  updateTrainerSkills,

  // new schedule APIs for controller
  getTrainerScheduleRaw,
  getTrainerScheduleSlots,
  getTrainerScheduleBoth,

  // export helpers if needed elsewhere (optional)
  generateSlotsFromAvailableHours,

  getTrainerBookings,
  confirmBooking,
};
