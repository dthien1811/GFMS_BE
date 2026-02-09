// services/trainerService.js
const { Trainer, TrainerShare, SessionProgress } = require('../models');

// ===== Hard rules for schedule slots =====
const SLOT_DURATION_MIN = 60;
const BREAK_DURATION_MIN = 15;

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


const parseAvailableHoursFromDb = (value) => {
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
};const normalizeAvailableHours = (input) => {
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
  return JSON.stringify(obj || {});
};

// ===== slot generator (60 + nghỉ 15) =====
const generateSlotsFromRange = (startHHmm, endHHmm) => {
  const start = parseHHmmToMinutes(startHHmm);
  const end = parseHHmmToMinutes(endHHmm);
  if (start === null || end === null || end <= start) return [];

  const step = SLOT_DURATION_MIN + BREAK_DURATION_MIN;

  const slots = [];
  let cur = start;

  while (cur + SLOT_DURATION_MIN <= end) {
    slots.push({
      start: minutesToHHmm(cur),
      end: minutesToHHmm(cur + SLOT_DURATION_MIN),
    });
    cur += step;
  }

  return slots;
};

const generateSlotsForDayRanges = (ranges = []) => {
  const all = [];
  for (const r of ranges) {
    all.push(...generateSlotsFromRange(r.start, r.end));
  }
  all.sort((a, b) => parseHHmmToMinutes(a.start) - parseHHmmToMinutes(b.start));
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

// lấy schedule raw (range)
const getTrainerScheduleRaw = async (id) => {
  const pt = await Trainer.findByPk(id, { attributes: ['id', 'availableHours'] });
  if (!pt) throw new Error('Trainer not found');

  const raw = parseAvailableHoursFromDb(pt.availableHours);
  return raw;
};

// lấy slots đã sinh theo rule
const getTrainerScheduleSlots = async (id) => {
  const raw = await getTrainerScheduleRaw(id);
  const slots = generateSlotsFromAvailableHours(raw);
  return slots;
};

// lấy cả raw + slots
const getTrainerScheduleBoth = async (id) => {
  const raw = await getTrainerScheduleRaw(id);
  const slots = generateSlotsFromAvailableHours(raw);
  return { availableHours: raw, slots };
};

// cập nhật schedule (chỉ lưu range)
const updateTrainerSchedule = async (id, scheduleData) => {
  try {
    const pt = await Trainer.findByPk(id, { attributes: ['id', 'availableHours'] });
    if (!pt) throw new Error('Trainer not found');

    const normalized = normalizeAvailableHours(scheduleData);
    if (!normalized) throw new Error('availableHours format is invalid');

    pt.availableHours = serializeAvailableHoursToDb(normalized);
    await pt.save();

    // trả về raw object + slots cho FE dùng luôn nếu muốn
    return {
      availableHours: normalized,
      slots: generateSlotsFromAvailableHours(normalized),
    };
  } catch (error) {
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
};
