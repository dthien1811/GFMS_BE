// services/trainerService.js
const db = require('../models');
// Sử dụng dòng này thay cho { Trainer, ... } cũ để tránh lệch tên model
const Trainer = db.trainer || db.Trainer; 
const { TrainerShare, SessionProgress, Booking, Member, Gym, User } = db;
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
    
    // Lưu vào DB (Đảm bảo cột availableHours là kiểu JSON hoặc TEXT)
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
              attributes: ["username", "email", "phone"],
            },
          ],
        },
        {
          model: Gym,
          attributes: ["name"],
        },
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
