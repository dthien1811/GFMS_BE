// be/src/controllers/trainerController.js
const db = require('../models');
const trainerService = require("../service/trainerService");
const cloudinaryService = require("../service/cloudinaryService");
const multer = require("multer");


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
const ReviewModel = db.Review || db.review;
const MemberModel = db.Member || db.member;
const NotificationModel = db.Notification || db.notification;
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const socketModule = require("../socket");
const { emitToUser, emitToTrainer } = socketModule.default || socketModule;
const realtimeService = require("../service/realtime.service").default;
const uploadVideo = multer({
  storage: multer.memoryStorage(),
  // memoryStorage => tăng max fileSize sẽ tốn RAM hơn.
  // 200MB đủ cho hầu hết demo video trong đồ án.
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = String(file?.mimetype || "").startsWith("video/");
    cb(ok ? null : new Error("Chỉ chấp nhận file video"), ok);
  },
});
const MIN_WITHDRAWAL_AMOUNT = 100000;
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = String(file?.mimetype || "").startsWith("image/");
    cb(ok ? null : new Error("Chỉ chấp nhận file ảnh"), ok);
  },
});
const uploadTrainingDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mime = String(file?.mimetype || "").toLowerCase();
    const ok = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].includes(mime);
    cb(ok ? null : new Error("Chỉ chấp nhận PDF/DOC/DOCX"), ok);
  },
});

const getBackendBaseURL = () => {
  const hostname = process.env.HOSTNAME || "localhost";
  const port = process.env.PORT || 8080;
  return `http://${hostname}:${port}`;
};

const saveBufferToUploads = (buffer, { subdir, filename }) => {
  const safe = String(filename || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
  const finalName = `${Date.now()}_${safe}`;

  const dir = path.join(process.cwd(), "uploads", subdir);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, finalName);
  fs.writeFileSync(filePath, buffer);

  return `${getBackendBaseURL()}/uploads/${subdir}/${finalName}`;
};

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
    // pendingCommission cần cho ví PT + validate rút tiền (trước đây thiếu → số dư luôn 0)
    attributes: ['id', 'userId', 'gymId', 'pendingCommission'],
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
    if (payload.maxSessionsPerDay !== undefined && !isPositiveNumber(payload.maxSessionsPerDay)) {
      return res.status(400).json({ message: 'maxSessionsPerDay must be a non-negative number' });
    }
    if (payload.minBookingNotice !== undefined && !isPositiveNumber(payload.minBookingNotice)) {
      return res.status(400).json({ message: 'minBookingNotice must be a non-negative number' });
    }
    if (payload.commissionRate !== undefined && !isPositiveNumber(payload.commissionRate)) {
      return res.status(400).json({ message: 'commissionRate must be a non-negative number' });
    }
    if (payload.rating !== undefined) {
      const r = Number(payload.rating);
      if (Number.isNaN(r) || r < 1 || r > 5) {
        return res.status(400).json({ message: 'rating must be between 1 and 5' });
      }
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
    const userAddress = typeof rawPayload.userAddress === "string" ? rawPayload.userAddress.trim() : undefined;
    delete payload.userAddress;

    if (payload.hourlyRate !== undefined && !isPositiveNumber(payload.hourlyRate)) {
      return res.status(400).json({ message: 'hourlyRate must be a non-negative number' });
    }
    if (payload.experienceYears !== undefined && !isPositiveNumber(payload.experienceYears)) {
      return res.status(400).json({ message: 'experienceYears must be a non-negative number' });
    }
    if (payload.maxSessionsPerDay !== undefined && !isPositiveNumber(payload.maxSessionsPerDay)) {
      return res.status(400).json({ message: 'maxSessionsPerDay must be a non-negative number' });
    }
    if (payload.minBookingNotice !== undefined && !isPositiveNumber(payload.minBookingNotice)) {
      return res.status(400).json({ message: 'minBookingNotice must be a non-negative number' });
    }
    if (payload.commissionRate !== undefined && !isPositiveNumber(payload.commissionRate)) {
      return res.status(400).json({ message: 'commissionRate must be a non-negative number' });
    }
    if (payload.rating !== undefined) {
      const r = Number(payload.rating);
      if (Number.isNaN(r) || r < 1 || r > 5) {
        return res.status(400).json({ message: 'rating must be between 1 and 5' });
      }
    }

    await trainer.update(payload);

    if (userAddress !== undefined && UserModel && trainer.userId) {
      const userRow = await UserModel.findByPk(trainer.userId);
      if (userRow) {
        userRow.address = userAddress;
        await userRow.save();
      }
    }

    const updated = await TrainerModel.findByPk(id, { attributes: TRAINER_ATTRIBUTES, raw: true });
    return res.status(200).json(updated || trainer);
  } catch (error) {
    console.error('[updateTrainer] Error:', error);
    return res.status(500).json({ message: 'Error updating trainer', error: error.message });
  }
};

exports.getTrainerSchedule = async (req, res) => {
  let { id } = req.params;
  const mode = (req.query?.mode || "raw").toLowerCase(); // raw | slots | both

  try {
    if (id === 'me') {
      const trainer = await TrainerModel.findOne({ where: { userId: req.user.id } });
      if (!trainer) return res.status(404).json({ message: 'Trainer profile not found' });
      id = trainer.id;
    }

    if (mode === "slots") {
      const slots = await trainerService.getTrainerScheduleSlots(id);
      return res.status(200).json({ slots });
    }

    if (mode === "both") {
      const data = await trainerService.getTrainerScheduleBoth(id);
      return res.status(200).json(data); // { availableHours, slots }
    }

    // default: raw
    const availableHours = await trainerService.getTrainerScheduleRaw(id);
    return res.status(200).json({ availableHours });

  } catch (error) {
    console.error("[getTrainerSchedule] Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

// ===================== UC-TR-006: UPDATE SCHEDULE =====================
exports.updateTrainerSchedule = async (req, res) => {
  let { id } = req.params;
  try {
    if (id === 'me') {
      const trainer = await TrainerModel.findOne({ where: { userId: req.user.id } });
      if (!trainer) return res.status(404).json({ message: 'Trainer not found' });
      id = trainer.id;
    }

    // Không cần validate phức tạp ở đây, đẩy hết cho Service xử lý
    const incoming = req.body; 

    const result = await trainerService.updateTrainerSchedule(id, incoming);
    return res.status(200).json(result);
  } catch (error) {
    console.error("[updateTrainerSchedule] Error:", error.message);
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
      include: GymModel
        ? [
            {
              model: GymModel,
              attributes: ["id", "name", "operatingHours"],
              required: false,
            },
          ]
        : [],
    });

    if (!trainer) {
      return res.status(404).json({
        message: 'Trainer profile not found for this user',
        userId,
      });
    }

    const plain = trainer.get ? trainer.get({ plain: true }) : trainer;
    if (plain?.Gym?.operatingHours && typeof plain.Gym.operatingHours === "string") {
      try {
        plain.Gym.operatingHours = JSON.parse(plain.Gym.operatingHours);
      } catch {
        /* keep string */
      }
    }

    return res.status(200).json(plain);
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

    const { status, fromDate, toDate, page: pageRaw, limit: limitRaw } = req.query || {};
    const where = { trainerId: trainer.id };

    if (status) where.status = status;
    if (fromDate || toDate) {
      where.sessionDate = {};
      if (fromDate) where.sessionDate[db.Sequelize.Op.gte] = new Date(fromDate);
      if (toDate) where.sessionDate[db.Sequelize.Op.lte] = new Date(toDate);
    }

    const include = [
      { model: GymModel, attributes: ['id', 'name'], required: false },
      {
        model: PackageActivationModel,
        attributes: ['id', 'packageId'],
        required: false,
        include: [{ model: PackageModel, attributes: ['id', 'name', 'sessions', 'price'], required: false }],
      },
    ];
    const order = [['sessionDate', 'DESC'], ['createdAt', 'DESC']];

    const hasPagination = pageRaw !== undefined || limitRaw !== undefined;
    if (!hasPagination) {
      const rows = await CommissionModel.findAll({ where, include, order });
      return res.status(200).json({ data: rows });
    }

    const page = Math.max(1, Number.parseInt(pageRaw, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(limitRaw, 10) || 20));
    const offset = (page - 1) * limit;

    const { count, rows } = await CommissionModel.findAndCountAll({
      where,
      include,
      order,
      limit,
      offset,
      distinct: true,
    });

    return res.status(200).json({
      data: rows,
      pagination: {
        total: Number(count || 0),
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(Number(count || 0) / limit)),
      },
    });
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
    const trainer = await getTrainerByUserId(userId);    const items = await PayrollItemModel.findAll({
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
      where: {
        trainerId: trainer.id,
        status: 'completed',
        withdrawalMethod: 'bank_transfer',
      },
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
    if (Number(amount) < MIN_WITHDRAWAL_AMOUNT) {
      return res.status(400).json({
        message: `Số tiền rút tối thiểu là ${MIN_WITHDRAWAL_AMOUNT.toLocaleString("vi-VN")}đ`,
      });
    }

    if (trainer.pendingCommission != null && Number(amount) > Number(trainer.pendingCommission || 0)) {
      return res.status(400).json({ message: "Số tiền vượt quá phần hoa hồng đang chờ" });
    }

    const row = await db.sequelize.transaction(async (t) => {
      const tr = await TrainerModel.findByPk(trainer.id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
        attributes: ["id", "pendingCommission", "gymId"],
      });
      if (!tr) {
        const err = new Error("Trainer profile not found");
        err.statusCode = 404;
        throw err;
      }
      const pending = Number(tr.pendingCommission || 0);
      if (Number(amount) > pending) {
        const err = new Error("Số tiền vượt quá phần hoa hồng đang chờ");
        err.statusCode = 400;
        throw err;
      }
      const w = await WithdrawalModel.create(
        {
          trainerId: tr.id,
          amount,
          withdrawalMethod,
          accountInfo: JSON.stringify(accountInfo || {}),
          status: "pending",
          processedBy: null,
          processedDate: null,
          notes,
          balanceHeld: true,
        },
        { transaction: t }
      );
      await tr.update({ pendingCommission: Math.max(0, pending - Number(amount)) }, { transaction: t });
      return w;
    });

    try {
      const gym = await GymModel.findByPk(trainer.gymId, { attributes: ["ownerId"] });
      if (gym?.ownerId) {
        emitToUser(gym.ownerId, "withdrawal:created", { id: row.id, status: row.status });
        await realtimeService.notifyUser(gym.ownerId, {
          title: "Có yêu cầu rút tiền mới từ PT",
          message: `PT #${trainer.id} vừa gửi yêu cầu rút ${Number(amount || 0).toLocaleString("vi-VN")}đ.`,
          notificationType: "withdrawal",
          relatedType: "withdrawal",
          relatedId: row.id,
        });
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

// ===================== UC-TR-010: DEMO VIDEOS =====================
exports.uploadDemoVideoMiddleware = uploadVideo.single("file");
exports.uploadProfileImageMiddleware = uploadImage.single("file");
exports.uploadTrainingPlanMiddleware = uploadTrainingDoc.single("file");

exports.uploadMyProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng chọn file ảnh" });
    }

    const imageType = String(req.body?.imageType || "avatar").toLowerCase();
    if (!["avatar", "cover", "certificate"].includes(imageType)) {
      return res.status(400).json({ message: "imageType phải là avatar, cover hoặc certificate" });
    }

    const trainer = await getTrainerByUserId(req.user?.id);
    let uploaded;
    try {
      uploaded = await cloudinaryService.uploadImageBuffer(req.file.buffer, {
        folder: "gfms/trainers/profile",
        filename: req.file.originalname,
      });
    } catch (err) {
      // Fallback local: chỉ dùng khi Cloudinary chưa cấu hình
      const msg = String(err?.message || "");
      const missingCloudinary = msg.includes("Cloudinary chưa được cấu hình") || msg.includes("CLOUDINARY_");
      if (!missingCloudinary) throw err;

      const url = saveBufferToUploads(req.file.buffer, {
        subdir:
          imageType === "avatar"
            ? "pt-avatars"
            : imageType === "cover"
              ? "pt-covers"
              : "pt-certificates",
        filename: req.file.originalname,
      });

      uploaded = { secure_url: url, public_id: null };
    }

    const trainerRow = await TrainerModel.findByPk(trainer.id);
    const links = trainerRow?.socialLinks || {};
    const profileImages = links.profileImages || {};
    const currentCertificates = Array.isArray(links?.certificates) ? links.certificates : [];
    const nextProfileImages = {
      ...profileImages,
      ...(imageType === "avatar"
        ? { avatarUrl: uploaded.secure_url }
        : imageType === "cover"
          ? { coverImageUrl: uploaded.secure_url }
          : { certificateUrl: uploaded.secure_url }),
    };

    const certificateName =
      String(req.body?.certificateName || "").trim() ||
      String(req.file?.originalname || "").trim() ||
      "Certificate";
    const nextCertificates =
      imageType === "certificate"
        ? [
            {
              id: `cert_${Date.now()}`,
              name: certificateName,
              url: uploaded.secure_url,
              publicId: uploaded.public_id || null,
              uploadedAt: new Date().toISOString(),
            },
            ...currentCertificates,
          ]
        : currentCertificates;

    trainerRow.socialLinks = {
      ...links,
      profileImages: nextProfileImages,
      certificates: nextCertificates,
    };
    await trainerRow.save();

    if (imageType === "avatar" && trainerRow.userId && UserModel) {
      try {
        const u = await UserModel.findByPk(trainerRow.userId, { attributes: ["id", "avatar"] });
        if (u) {
          u.avatar = uploaded.secure_url;
          await u.save();
        }
      } catch (syncErr) {
        console.warn("[uploadMyProfileImage] User.avatar sync:", syncErr?.message || syncErr);
      }
    }

    return res.status(200).json({
      data: {
        imageType,
        url: uploaded.secure_url,
        publicId: uploaded.public_id,
      },
      message: "Upload ảnh thành công",
    });
  } catch (error) {
    console.error("[uploadMyProfileImage] Error:", error);
    return res.status(error.statusCode || 500).json({ message: error.message || "Upload ảnh thất bại" });
  }
};

exports.getMyDemoVideos = async (req, res) => {
  try {
    const trainer = await getTrainerByUserId(req.user?.id);
    const fullTrainer = await TrainerModel.findByPk(trainer.id, {
      attributes: ["id", "socialLinks"],
      raw: true,
    });
    const socialLinks = fullTrainer?.socialLinks || {};
    const demoVideos = Array.isArray(socialLinks?.demoVideos) ? socialLinks.demoVideos : [];
    return res.status(200).json({ data: demoVideos });
  } catch (error) {
    console.error("[getMyDemoVideos] Error:", error);
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

exports.getMyTrainingPlans = async (req, res) => {
  try {
    const trainer = await getTrainerByUserId(req.user?.id);
    const fullTrainer = await TrainerModel.findByPk(trainer.id, {
      attributes: ["id", "socialLinks"],
      raw: true,
    });
    const socialLinks = fullTrainer?.socialLinks || {};
    const trainingPlans = Array.isArray(socialLinks?.trainingPlans) ? socialLinks.trainingPlans : [];
    return res.status(200).json({ data: trainingPlans });
  } catch (error) {
    console.error("[getMyTrainingPlans] Error:", error);
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

exports.uploadMyDemoVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng chọn file video" });
    }
    const trainer = await getTrainerByUserId(req.user?.id);
    const trainerRow = await TrainerModel.findByPk(trainer.id);
    if (!trainerRow) return res.status(404).json({ message: "Trainer not found" });

    let uploaded;
    try {
      uploaded = await cloudinaryService.uploadVideoBuffer(req.file.buffer, {
        folder: "gfms/trainers/demo-videos",
        filename: req.file.originalname,
      });
    } catch (err) {
      // Fallback local: chỉ dùng khi Cloudinary chưa được cấu hình
      const msg = String(err?.message || "");
      const missingCloudinary = msg.includes("Cloudinary chưa được cấu hình") || msg.includes("CLOUDINARY_");
      if (!missingCloudinary) throw err;

      const url = saveBufferToUploads(req.file.buffer, {
        subdir: "pt-demo-videos",
        filename: req.file.originalname,
      });

      uploaded = {
        secure_url: url,
        public_id: null,
        // để FE hiển thị format bytes thay vì N/A
        bytes: req.file?.size,
      };
    }

    const currentLinks = trainerRow.socialLinks || {};
    const currentVideos = Array.isArray(currentLinks.demoVideos) ? currentLinks.demoVideos : [];
    const item = {
      id: `vid_${Date.now()}`,
      title: String(req.body?.title || "").trim() || req.file.originalname,
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      duration: uploaded.duration || null,
      format: uploaded.format || null,
      bytes: uploaded.bytes || null,
      uploadedAt: new Date().toISOString(),
    };

    trainerRow.socialLinks = {
      ...currentLinks,
      demoVideos: [item, ...currentVideos],
    };
    await trainerRow.save();

    return res.status(201).json({ data: item, message: "Upload video demo thành công" });
  } catch (error) {
    console.error("[uploadMyDemoVideo] Error:", error);
    return res.status(500).json({ message: error.message || "Upload thất bại" });
  }
};

exports.uploadMyTrainingPlan = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng chọn file kế hoạch" });
    }
    const trainer = await getTrainerByUserId(req.user?.id);
    const trainerRow = await TrainerModel.findByPk(trainer.id);
    if (!trainerRow) return res.status(404).json({ message: "Trainer not found" });

    let uploaded;
    try {
      uploaded = await cloudinaryService.uploadRawBuffer(req.file.buffer, {
        folder: "gfms/trainers/training-plans",
        filename: req.file.originalname,
      });
    } catch (err) {
      const msg = String(err?.message || "");
      const missingCloudinary = msg.includes("Cloudinary chưa được cấu hình") || msg.includes("CLOUDINARY_");
      if (!missingCloudinary) throw err;

      const url = saveBufferToUploads(req.file.buffer, {
        subdir: "pt-training-plans",
        filename: req.file.originalname,
      });

      uploaded = { secure_url: url, public_id: null, bytes: req.file?.size, format: null };
    }

    const currentLinks = trainerRow.socialLinks || {};
    const currentPlans = Array.isArray(currentLinks.trainingPlans) ? currentLinks.trainingPlans : [];
    const item = {
      id: `plan_${Date.now()}`,
      title: String(req.body?.title || "").trim() || req.file.originalname,
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      bytes: uploaded.bytes || req.file?.size || null,
      format: uploaded.format || null,
      mimeType: req.file?.mimetype || null,
      uploadedAt: new Date().toISOString(),
    };

    trainerRow.socialLinks = {
      ...currentLinks,
      trainingPlans: [item, ...currentPlans],
    };
    await trainerRow.save();

    return res.status(201).json({ data: item, message: "Upload file kế hoạch thành công" });
  } catch (error) {
    console.error("[uploadMyTrainingPlan] Error:", error);
    return res.status(500).json({ message: error.message || "Upload thất bại" });
  }
};

exports.deleteMyDemoVideo = async (req, res) => {
  try {
    const videoId = String(req.params?.videoId || "");
    if (!videoId) return res.status(400).json({ message: "videoId is required" });

    const trainer = await getTrainerByUserId(req.user?.id);
    const trainerRow = await TrainerModel.findByPk(trainer.id);
    if (!trainerRow) return res.status(404).json({ message: "Trainer not found" });

    const currentLinks = trainerRow.socialLinks || {};
    const currentVideos = Array.isArray(currentLinks.demoVideos) ? currentLinks.demoVideos : [];
    const target = currentVideos.find((x) => String(x?.id) === videoId);
    if (!target) return res.status(404).json({ message: "Video không tồn tại" });

    if (target.publicId) {
      try {
        await cloudinaryService.destroy(target.publicId, "video");
      } catch (e) {
        // ignore cloudinary delete error and still remove local reference
      }
    }

    trainerRow.socialLinks = {
      ...currentLinks,
      demoVideos: currentVideos.filter((x) => String(x?.id) !== videoId),
    };
    await trainerRow.save();
    return res.status(200).json({ message: "Đã xóa video demo" });
  } catch (error) {
    console.error("[deleteMyDemoVideo] Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

exports.deleteMyTrainingPlan = async (req, res) => {
  try {
    const planId = String(req.params?.planId || "");
    if (!planId) return res.status(400).json({ message: "planId is required" });

    const trainer = await getTrainerByUserId(req.user?.id);
    const trainerRow = await TrainerModel.findByPk(trainer.id);
    if (!trainerRow) return res.status(404).json({ message: "Trainer not found" });

    const currentLinks = trainerRow.socialLinks || {};
    const currentPlans = Array.isArray(currentLinks.trainingPlans) ? currentLinks.trainingPlans : [];
    const target = currentPlans.find((x) => String(x?.id) === planId);
    if (!target) return res.status(404).json({ message: "File kế hoạch không tồn tại" });

    if (target.publicId) {
      try {
        await cloudinaryService.destroy(target.publicId, "raw");
      } catch (e) {
        // ignore cloud delete
      }
    }

    trainerRow.socialLinks = {
      ...currentLinks,
      trainingPlans: currentPlans.filter((x) => String(x?.id) !== planId),
    };
    await trainerRow.save();
    return res.status(200).json({ message: "Đã xóa file kế hoạch" });
  } catch (error) {
    console.error("[deleteMyTrainingPlan] Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

// ===================== UC-TR-011 + UC-TR-012: REVIEWS =====================
exports.getMyReviews = async (req, res) => {
  try {
    mustHaveModel(ReviewModel, "Review");
    const trainer = await getTrainerByUserId(req.user?.id);

    const where = { trainerId: trainer.id };
    const rating = Number(req.query?.rating);
    if (rating >= 1 && rating <= 5) where.rating = rating;

    const rows = await ReviewModel.findAll({
      where,
      include: [
        {
          model: MemberModel,
          required: false,
          include: [{ model: UserModel, attributes: ["id", "username", "email"], required: false }],
        },
        {
          model: db.Booking || db.booking,
          required: false,
          attributes: ["id", "bookingDate", "startTime", "endTime", "status"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error("[getMyReviews] Error:", error);
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

exports.replyReview = async (req, res) => {
  try {
    mustHaveModel(ReviewModel, "Review");
    const trainer = await getTrainerByUserId(req.user?.id);
    const reviewId = Number(req.params?.id);
    const trainerReply = String(req.body?.reply || "").trim();

    if (!reviewId) return res.status(400).json({ message: "review id is required" });
    if (!trainerReply) return res.status(400).json({ message: "reply is required" });
    if (trainerReply.length > 2000) return res.status(400).json({ message: "reply is too long" });

    const row = await ReviewModel.findOne({
      where: { id: reviewId, trainerId: trainer.id },
      include: [
        {
          model: MemberModel,
          attributes: ["id", "userId"],
          required: false,
        },
      ],
    });
    if (!row) return res.status(404).json({ message: "Không tìm thấy review" });

    row.trainerReply = trainerReply;
    row.repliedAt = new Date();
    await row.save();

    res.status(200).json({ data: row, message: "Đã phản hồi đánh giá" });

    Promise.resolve()
      .then(async () => {
        const memberUserId =
          row?.Member?.userId ||
          (row?.memberId && MemberModel
            ? (await MemberModel.findByPk(row.memberId, { attributes: ["userId"] }))?.userId
            : null);

        if (memberUserId && NotificationModel) {
          const noti = await NotificationModel.create({
            userId: memberUserId,
            title: "PT đã phản hồi đánh giá của bạn",
            message: trainerReply.slice(0, 160),
            notificationType: "review",
            relatedType: "review",
            relatedId: row.id,
            isRead: false,
          });
          emitToUser(memberUserId, "notification:new", noti.toJSON ? noti.toJSON() : noti);
        }
      })
      .catch((notifyErr) => {
        console.warn("[replyReview] notify member error:", notifyErr?.message || notifyErr);
      });
    return;
  } catch (error) {
    console.error("[replyReview] Error:", error);
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};


exports.getTrainerBookings = async (req, res) => {
  let { id } = req.params;

  try {
    // 1. Nếu dùng route /me/bookings
    if (id === 'me') {
      const trainer = await TrainerModel.findOne({ 
        where: { userId: req.user.id } 
      });

      if (!trainer) {
        // Thay vì để undefined gây lỗi 500, ta trả về 404
        return res.status(404).json({ 
          message: `Không tìm thấy PT cho User ID ${req.user.id}. (DB đang để userId là 6)` 
        });
      }
      id = trainer.id; // Lúc này id sẽ là '2'
    }

    // 2. Kiểm tra bắt buộc trước khi gọi Service
    if (!id || id === 'undefined') {
       return res.status(400).json({ message: "Trainer ID không hợp lệ (undefined)" });
    }

    const bookings = await trainerService.getTrainerBookings(id);
    return res.status(200).json(bookings);

  } catch (error) {
    // Ngăn chặn lỗi 500 bằng cách log lỗi cụ thể
    console.error("❌ Lỗi Controller:", error.message);
    return res.status(500).json({ message: error.message });
  }
};
exports.confirmBooking = async (req, res) => {
  const { id } = req.params; // bookingId
  try {
    const booking = await trainerService.confirmBooking(id);
    return res.status(200).json({ message: 'Confirmed', booking });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

