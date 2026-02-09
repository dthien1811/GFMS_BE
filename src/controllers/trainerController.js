// be/src/controllers/trainerController.js
const db = require('../models');
const trainerService = require("../service/trainerService");


// TỰ ĐỘNG BẮT ĐÚNG TÊN MODEL (Trainer hoặc trainer)
const TrainerModel = db.Trainer || db.trainer;
const UserModel = db.User || db.user;
const TrainerShareModel = db.TrainerShare || db.trainershare;
const SessionProgressModel = db.SessionProgress || db.sessionprogress;
const CommissionModel = db.Commission || db.commission;
const PayrollItemModel = db.PayrollItem || db.payrollitem;
const PayrollPeriodModel = db.PayrollPeriod || db.payrollperiod;
const GymModel = db.Gym || db.gym;
const PackageActivationModel = db.PackageActivation || db.packageactivation;
const PackageModel = db.Package || db.package;
const WithdrawalModel = db.Withdrawal || db.withdrawal;
const ExcelJS = require("exceljs");
const socketModule = require("../socket");
const { emitToUser, emitToTrainer } = socketModule.default || socketModule;

const mustHaveModel = (Model, name) => {
  if (!Model) {
    throw new Error(
      `Missing Sequelize model: ${name}. Check ../models/index.js export name (Trainer vs trainer).`
    );
  }
};

const getTrainerByUserId = async (userId) => {
  mustHaveModel(TrainerModel, 'Trainer');
  const trainer = await TrainerModel.findOne({
    where: { userId },
    attributes: ['id', 'userId', 'gymId'],
  });
  if (!trainer) {
    const err = new Error('Trainer profile not found');
    err.statusCode = 404;
    throw err;
  }
  return trainer;
};

// Danh sách cột đúng theo DB của bạn (tránh Sequelize tự select gymId nếu model khai báo nhầm)
const TRAINER_ATTRIBUTES = [
  'id',
  'userId',
  'gymId',
  'specialization',
  'certification',
  'experienceYears',
  'hourlyRate',
  'commissionRate',
  'rating',
  'totalSessions',
  'status',
  'bio',
  'availableHours',
  'preferredGyms',
  'maxSessionsPerDay',
  'minBookingNotice',
  'isAvailableForShare',
  'languages',
  'socialLinks',
  'totalEarned',
  'pendingCommission',
  'lastPayoutDate',
  'payoutMethod',
  'bankAccountInfo',
  'createdAt',
  'updatedAt',
];

// ---- Helpers normalize ----
const toNumberOrUndefined = (v) => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number') return Number.isNaN(v) ? undefined : v;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return undefined;
    const n = Number(trimmed);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
};

// ===== Hard rules for schedule slots =====
const SLOT_DURATION_MIN = 60;  // 1 buổi học
const BREAK_DURATION_MIN = 15; // nghỉ giữa buổi

const DAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

const parseHHmmToMinutes = (hhmm) => {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

const minutesToHHmm = (mins) => {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
};

// Sinh slot từ 1 khoảng rảnh (start-end)
// Slot: 60 phút, sau đó nhảy +15 phút (buffer nghỉ)
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

// Sinh slot cho 1 ngày (từ list ranges của ngày đó)
const generateSlotsForDayRanges = (ranges = []) => {
  const all = [];
  for (const r of ranges) {
    all.push(...generateSlotsFromRange(r.start, r.end));
  }
  // optional: sort + unique
  all.sort((a,b) => parseHHmmToMinutes(a.start) - parseHHmmToMinutes(b.start));
  return all;
};


const isPositiveNumber = (v) => typeof v === 'number' && !Number.isNaN(v) && v >= 0;

const normalizeAvailableHours = (availableHours) => {
  if (!availableHours) return {};
  if (typeof availableHours !== 'object') return null;

  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  for (const d of Object.keys(availableHours)) {
    if (!days.includes(d)) return null;
    if (!Array.isArray(availableHours[d])) return null;

    for (const slot of availableHours[d]) {
      if (!slot || typeof slot !== 'object') return null;
      if (typeof slot.start !== 'string' || typeof slot.end !== 'string') return null;

      const s = parseHHmmToMinutes(slot.start);
      const e = parseHHmmToMinutes(slot.end);
      if (s === null || e === null) return null;
      if (e <= s) return null;
    }
  }
  return availableHours;
};

const normalizeCreatePayload = (payload = {}) => {
  const p = { ...payload };

  // BẮT userId từ nhiều kiểu key (frontend hay đặt sai)
  if (p.userId === undefined) p.userId = p.userID;
  if (p.userId === undefined) p.userId = p.userid;
  if (p.userId === undefined) p.userId = p.user_id;

  // gymId normalize (cho phép FE gửi string)
  p.gymId = toNumberOrUndefined(p.gymId);

  // Ép kiểu number cho các field số (frontend thường gửi string)
  p.userId = toNumberOrUndefined(p.userId);
  p.experienceYears = toNumberOrUndefined(p.experienceYears);
  p.hourlyRate = toNumberOrUndefined(p.hourlyRate);
  p.commissionRate = toNumberOrUndefined(p.commissionRate);
  p.rating = toNumberOrUndefined(p.rating);
  p.totalSessions = toNumberOrUndefined(p.totalSessions);
  p.maxSessionsPerDay = toNumberOrUndefined(p.maxSessionsPerDay);
  p.minBookingNotice = toNumberOrUndefined(p.minBookingNotice);
  p.totalEarned = toNumberOrUndefined(p.totalEarned);
  p.pendingCommission = toNumberOrUndefined(p.pendingCommission);

  // Boolean (nếu FE gửi "1"/"0"/true/false)
  if (p.isAvailableForShare !== undefined && typeof p.isAvailableForShare !== 'boolean') {
    if (p.isAvailableForShare === '1' || p.isAvailableForShare === 1) p.isAvailableForShare = true;
    else if (p.isAvailableForShare === '0' || p.isAvailableForShare === 0) p.isAvailableForShare = false;
  }

  // availableHours normalize
  if (p.availableHours !== undefined) {
    const normalized = normalizeAvailableHours(p.availableHours);
    if (!normalized) return { error: 'availableHours format is invalid' };
    p.availableHours = normalized;
  }

  return { payload: p };
};

// ===================== UC-TR-001: GET LIST =====================
exports.getTrainers = async (req, res) => {
  try {
    mustHaveModel(TrainerModel, 'Trainer');
    mustHaveModel(UserModel, 'User');

    const trainers = await TrainerModel.findAll({
      attributes: TRAINER_ATTRIBUTES,
      include: [
        {
          model: UserModel,
          attributes: ['id', 'username', 'email', 'phone'],
        },
      ],
      order: [['id', 'DESC']],
    });

    return res.status(200).json({ trainers });
  } catch (error) {
    console.error('[getTrainers] Error:', error);
    return res.status(500).json({ message: 'Error fetching trainers', error: error.message });
  }
};

// ===================== UC-TR-002: CREATE =====================
exports.createTrainer = async (req, res) => {
  try {
    mustHaveModel(TrainerModel, 'Trainer');

    const rawPayload = req.body || {};
    const normalized = normalizeCreatePayload(rawPayload);
    if (normalized.error) {
      return res.status(400).json({ message: normalized.error });
    }
    const payload = normalized.payload;

    // Validate tối thiểu
    if (!payload.userId) {
      // cho dev dễ debug: trả về body đã nhận key gì
      return res.status(400).json({
        message: 'userId is required (frontend may send userID/user_id/userid).',
        receivedKeys: Object.keys(rawPayload),
      });
    }

    if (!payload.gymId) {
      return res.status(400).json({
        message: 'gymId is required when creating trainer.',
        receivedKeys: Object.keys(rawPayload),
      });
    }

    if (payload.hourlyRate !== undefined && !isPositiveNumber(payload.hourlyRate)) {
      return res.status(400).json({ message: 'hourlyRate must be a non-negative number' });
    }
    if (payload.experienceYears !== undefined && !isPositiveNumber(payload.experienceYears)) {
      return res.status(400).json({ message: 'experienceYears must be a non-negative number' });
    }

    const newTrainer = await TrainerModel.create(payload);

    // Trả về record chuẩn attributes (tránh gymId)
    const created = await TrainerModel.findByPk(newTrainer.id, {
      attributes: TRAINER_ATTRIBUTES,
      raw: true,
    });

    return res.status(201).json(created || newTrainer);
  } catch (error) {
    console.error('[createTrainer] Error:', error);
    return res.status(500).json({ message: 'Error creating trainer', error: error.message });
  }
};

// ===================== UC-TR-003: UPDATE BASIC INFO =====================
exports.updateTrainer = async (req, res) => {
  const { id } = req.params;

  try {
    mustHaveModel(TrainerModel, 'Trainer');

    const trainer = await TrainerModel.findByPk(id, { attributes: TRAINER_ATTRIBUTES });
    if (!trainer) return res.status(404).json({ message: 'Trainer not found' });

    const rawPayload = req.body || {};
    const normalized = normalizeCreatePayload(rawPayload);
    if (normalized.error) {
      return res.status(400).json({ message: normalized.error });
    }
    const payload = normalized.payload;

    if (payload.hourlyRate !== undefined && !isPositiveNumber(payload.hourlyRate)) {
      return res.status(400).json({ message: 'hourlyRate must be a non-negative number' });
    }
    if (payload.experienceYears !== undefined && !isPositiveNumber(payload.experienceYears)) {
      return res.status(400).json({ message: 'experienceYears must be a non-negative number' });
    }

    await trainer.update(payload);

    const updated = await TrainerModel.findByPk(id, { attributes: TRAINER_ATTRIBUTES, raw: true });
    return res.status(200).json(updated || trainer);
  } catch (error) {
    console.error('[updateTrainer] Error:', error);
    return res.status(500).json({ message: 'Error updating trainer', error: error.message });
  }
};

// ===================== UC-TR-005: GET SCHEDULE =====================
exports.getTrainerSchedule = async (req, res) => {
  const { id } = req.params;
  const mode = (req.query?.mode || "raw").toLowerCase(); // raw | slots | both

  try {
    if (mode === "slots") {
      const slots = await trainerService.getTrainerScheduleSlots(id);
      return res.status(200).json({ slots });
    }

    if (mode === "both") {
      const data = await trainerService.getTrainerScheduleBoth(id);
      return res.status(200).json(data); // { availableHours, slots }
    }

    const availableHours = await trainerService.getTrainerScheduleRaw(id);
    return res.status(200).json({ availableHours });
  } catch (error) {
    console.error("[getTrainerSchedule] Error:", error);
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

// ===================== UC-TR-006: UPDATE SCHEDULE =====================
exports.updateTrainerSchedule = async (req, res) => {
  const { id } = req.params;

  try {
    const incoming =
      req.body?.availableHours && typeof req.body.availableHours === "object"
        ? req.body.availableHours
        : req.body;

    const result = await trainerService.updateTrainerSchedule(id, incoming);
    // result: { availableHours, slots } (service trả)
    return res.status(200).json(result);
  } catch (error) {
    console.error("[updateTrainerSchedule] Error:", error);
    return res.status(400).json({ message: error.message });
  }
};


// ===================== UC-TR-007: DETAILS =====================
exports.getTrainerDetails = async (req, res) => {
  const { id } = req.params;

  try {
    mustHaveModel(TrainerModel, 'Trainer');

    const include = [];
    if (UserModel) include.push(UserModel);
    if (TrainerShareModel) include.push(TrainerShareModel);
    if (SessionProgressModel) include.push(SessionProgressModel);

    const pt = await TrainerModel.findByPk(id, {
      attributes: TRAINER_ATTRIBUTES, // IMPORTANT: tránh gymId
      include,
    });

    if (!pt) return res.status(404).json({ message: 'Trainer not found' });

    return res.status(200).json(pt);
  } catch (error) {
    console.error('[getTrainerDetails] Error:', error);
    return res.status(500).json({ message: 'Error fetching trainer details', error: error.message });
  }
};

// ===================== UC-TR-008: UPDATE SKILLS =====================
exports.updateTrainerSkills = async (req, res) => {
  const { id } = req.params;

  try {
    mustHaveModel(TrainerModel, 'Trainer');

    const trainer = await TrainerModel.findByPk(id, { attributes: TRAINER_ATTRIBUTES });
    if (!trainer) return res.status(404).json({ message: 'Trainer not found' });

    const { specialization, certification } = req.body || {};

    if (specialization !== undefined && typeof specialization !== 'string') {
      return res.status(400).json({ message: 'specialization must be a string' });
    }
    if (certification !== undefined && typeof certification !== 'string') {
      return res.status(400).json({ message: 'certification must be a string' });
    }

    trainer.specialization = specialization ?? trainer.specialization;
    trainer.certification = certification ?? trainer.certification;

    await trainer.save();

    const updated = await TrainerModel.findByPk(id, { attributes: TRAINER_ATTRIBUTES, raw: true });
    return res.status(200).json(updated || trainer);
  } catch (error) {
    console.error('[updateTrainerSkills] Error:', error);
    return res.status(500).json({ message: 'Error updating skills', error: error.message });
  }
};

// ===================== UC-TR-000: GET MY TRAINER PROFILE =====================
exports.getMyTrainerProfile = async (req, res) => {
  try {
    mustHaveModel(TrainerModel, 'Trainer');

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthenticated (missing req.user.id)' });
    }

    const trainer = await TrainerModel.findOne({
      where: { userId },
      attributes: TRAINER_ATTRIBUTES,
      raw: true,
    });

    if (!trainer) {
      return res.status(404).json({
        message: 'Trainer profile not found for this user',
        userId,
      });
    }

    return res.status(200).json(trainer);
  } catch (error) {
    console.error('[getMyTrainerProfile] Error:', error);
    return res.status(500).json({ message: 'Error fetching my trainer profile', error: error.message });
  }
};

// ===================== PT: COMMISSIONS =====================
exports.getMyCommissions = async (req, res) => {
  try {
    mustHaveModel(CommissionModel, 'Commission');
    mustHaveModel(UserModel, 'User');

    const userId = req.user?.id;
    const trainer = await getTrainerByUserId(userId);

    const { status, fromDate, toDate } = req.query || {};
    const where = { trainerId: trainer.id };

    if (status) where.status = status;
    if (fromDate || toDate) {
      where.sessionDate = {};
      if (fromDate) where.sessionDate[db.Sequelize.Op.gte] = new Date(fromDate);
      if (toDate) where.sessionDate[db.Sequelize.Op.lte] = new Date(toDate);
    }

    const rows = await CommissionModel.findAll({
      where,
      include: [
        { model: GymModel, attributes: ['id', 'name'], required: false },
        {
          model: PackageActivationModel,
          attributes: ['id', 'packageId'],
          required: false,
          include: [{ model: PackageModel, attributes: ['id', 'name', 'sessions', 'price'], required: false }],
        },
      ],
      order: [['sessionDate', 'DESC'], ['createdAt', 'DESC']],
    });

    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('[getMyCommissions] Error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

// ===================== PT: PAYROLL PERIODS =====================
exports.getMyPayrollPeriods = async (req, res) => {
  try {
    mustHaveModel(PayrollItemModel, 'PayrollItem');
    mustHaveModel(PayrollPeriodModel, 'PayrollPeriod');

    const userId = req.user?.id;
    const trainer = await getTrainerByUserId(userId);

    const items = await PayrollItemModel.findAll({
      where: { trainerId: trainer.id },
      include: [
        {
          model: PayrollPeriodModel,
          required: false,
          include: [{ model: GymModel, attributes: ['id', 'name'], required: false }],
        },
      ],
      order: [['id', 'DESC']],
    });

    return res.status(200).json({ data: items });
  } catch (error) {
    console.error('[getMyPayrollPeriods] Error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

// ===================== PT: WITHDRAWALS =====================
exports.getMyWithdrawals = async (req, res) => {
  try {
    mustHaveModel(WithdrawalModel, 'Withdrawal');

    const userId = req.user?.id;
    const trainer = await getTrainerByUserId(userId);

    const rows = await WithdrawalModel.findAll({
      where: { trainerId: trainer.id },
      order: [['id', 'DESC']],
    });

    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('[getMyWithdrawals] Error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

// ===================== PT: WALLET SUMMARY =====================
exports.getMyWalletSummary = async (req, res) => {
  try {
    mustHaveModel(WithdrawalModel, 'Withdrawal');
    const userId = req.user?.id;
    const trainer = await getTrainerByUserId(userId);

    const totalWithdrawn = await WithdrawalModel.sum('amount', {
      where: { trainerId: trainer.id, status: 'completed' },
    });

    return res.status(200).json({
      data: {
        availableBalance: Number(trainer.pendingCommission || 0),
        totalWithdrawn: Number(totalWithdrawn || 0),
      },
    });
  } catch (error) {
    console.error('[getMyWalletSummary] Error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

exports.requestWithdrawal = async (req, res) => {
  try {
    mustHaveModel(WithdrawalModel, 'Withdrawal');
    const userId = req.user?.id;
    const trainer = await getTrainerByUserId(userId);

    const amount = Number(req.body?.amount || 0);
    const withdrawalMethod = req.body?.withdrawalMethod || "bank_transfer";
    const accountInfo = req.body?.accountInfo || {};
    if (withdrawalMethod === "bank_transfer") {
      if (!accountInfo?.bankName || !accountInfo?.accountNumber || !accountInfo?.accountHolder) {
        return res.status(400).json({ message: "Thiếu thông tin tài khoản ngân hàng" });
      }
    }
    const notes = req.body?.notes || "";

    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "Số tiền không hợp lệ" });
    }

    if (trainer.pendingCommission != null && Number(amount) > Number(trainer.pendingCommission || 0)) {
      return res.status(400).json({ message: "Số tiền vượt quá phần hoa hồng đang chờ" });
    }

    const row = await WithdrawalModel.create({
      trainerId: trainer.id,
      amount,
      withdrawalMethod,
      accountInfo: JSON.stringify(accountInfo || {}),
      status: "pending",
      processedBy: null,
      processedDate: null,
      notes,
    });

    try {
      const gym = await GymModel.findByPk(trainer.gymId, { attributes: ["ownerId"] });
      if (gym?.ownerId) {
        emitToUser(gym.ownerId, "withdrawal:created", { id: row.id, status: row.status });
      }
      emitToTrainer(trainer.id, "withdrawal:created", { id: row.id, status: row.status });
    } catch (e) {
      // ignore socket errors
    }

    return res.status(201).json({ data: row, message: "Đã tạo yêu cầu chi trả" });
  } catch (error) {
    console.error('[requestWithdrawal] Error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

// ===================== PT: PERIOD DETAILS =====================
exports.getMyPayrollPeriodCommissions = async (req, res) => {
  try {
    mustHaveModel(CommissionModel, 'Commission');
    const userId = req.user?.id;
    const trainer = await getTrainerByUserId(userId);
    const periodId = Number(req.params?.periodId);
    if (!periodId) return res.status(400).json({ message: "periodId is required" });

    const rows = await CommissionModel.findAll({
      where: { trainerId: trainer.id, payrollPeriodId: periodId },
      include: [
        { model: GymModel, attributes: ['id', 'name'], required: false },
        {
          model: PackageActivationModel,
          attributes: ['id', 'packageId'],
          required: false,
          include: [{ model: PackageModel, attributes: ['id', 'name', 'sessions', 'price'], required: false }],
        },
      ],
      order: [['sessionDate', 'DESC']],
    });

    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('[getMyPayrollPeriodCommissions] Error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

// ===================== PT: EXPORT COMMISSIONS =====================
exports.exportMyCommissions = async (req, res) => {
  try {
    mustHaveModel(CommissionModel, 'Commission');
    const userId = req.user?.id;
    const trainer = await getTrainerByUserId(userId);

    const { status, fromDate, toDate } = req.query || {};
    const where = { trainerId: trainer.id };
    if (status) where.status = status;
    if (fromDate || toDate) {
      where.sessionDate = {};
      if (fromDate) where.sessionDate[db.Sequelize.Op.gte] = new Date(fromDate);
      if (toDate) where.sessionDate[db.Sequelize.Op.lte] = new Date(toDate);
    }

    const rows = await CommissionModel.findAll({
      where,
      include: [
        { model: GymModel, attributes: ['id', 'name'], required: false },
        {
          model: PackageActivationModel,
          attributes: ['id', 'packageId'],
          required: false,
          include: [{ model: PackageModel, attributes: ['id', 'name', 'sessions', 'price'], required: false }],
        },
      ],
      order: [['sessionDate', 'DESC']],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("PT_Commissions");
    sheet.columns = [
      { header: "Ngay buoi tap", key: "sessionDate", width: 16 },
      { header: "Phong gym", key: "gym", width: 20 },
      { header: "Goi tap", key: "package", width: 20 },
      { header: "Gia tri/buoi", key: "sessionValue", width: 16 },
      { header: "Hoa hong PT", key: "commissionAmount", width: 16 },
      { header: "Trang thai", key: "status", width: 12 },
    ];

    rows.forEach((r) => {
      sheet.addRow({
        sessionDate: r.sessionDate ? new Date(r.sessionDate).toLocaleDateString("vi-VN") : "N/A",
        gym: r.Gym?.name || "N/A",
        package: r.PackageActivation?.Package?.name || "N/A",
        sessionValue: Number(r.sessionValue || 0),
        commissionAmount: Number(r.commissionAmount || 0),
        status: r.status || "N/A",
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="pt_commissions.xlsx"`);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('[exportMyCommissions] Error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};