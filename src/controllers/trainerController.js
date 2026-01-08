// be/src/controllers/trainerController.js
const db = require('../models');

// TỰ ĐỘNG BẮT ĐÚNG TÊN MODEL (Trainer hoặc trainer)
const TrainerModel = db.Trainer || db.trainer;
const UserModel = db.User || db.user;
const TrainerShareModel = db.TrainerShare || db.trainershare;
const SessionProgressModel = db.SessionProgress || db.sessionprogress;

const mustHaveModel = (Model, name) => {
  if (!Model) {
    throw new Error(
      `Missing Sequelize model: ${name}. Check ../models/index.js export name (Trainer vs trainer).`
    );
  }
};

// Danh sách cột đúng theo DB của bạn (tránh Sequelize tự select gymId nếu model khai báo nhầm)
const TRAINER_ATTRIBUTES = [
  'id',
  'userId',
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

const isPositiveNumber = (v) => typeof v === 'number' && !Number.isNaN(v) && v >= 0;

const normalizeAvailableHours = (availableHours) => {
  // Cho phép null/undefined => {}
  if (!availableHours) return {};
  if (typeof availableHours !== 'object') return null;

  // format kỳ vọng:
  // { monday:[{start:"09:00", end:"18:00"}], ... }
  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  for (const d of Object.keys(availableHours)) {
    if (!days.includes(d)) return null;
    if (!Array.isArray(availableHours[d])) return null;
    for (const slot of availableHours[d]) {
      if (!slot || typeof slot !== 'object') return null;
      if (typeof slot.start !== 'string' || typeof slot.end !== 'string') return null;
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

    const trainers = await TrainerModel.findAll({
      attributes: TRAINER_ATTRIBUTES,
      order: [['id', 'DESC']],
      raw: true,
    });

    return res.status(200).json(trainers);
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

  try {
    mustHaveModel(TrainerModel, 'Trainer');

    const trainer = await TrainerModel.findByPk(id, {
      attributes: ['id', 'availableHours'],
      raw: true,
    });
    if (!trainer) return res.status(404).json({ message: 'Trainer not found' });

    return res.status(200).json(trainer.availableHours || {});
  } catch (error) {
    console.error('[getTrainerSchedule] Error:', error);
    return res.status(500).json({ message: 'Error fetching schedule', error: error.message });
  }
};

// ===================== UC-TR-006: UPDATE SCHEDULE =====================
exports.updateTrainerSchedule = async (req, res) => {
  const { id } = req.params;

  try {
    mustHaveModel(TrainerModel, 'Trainer');

    const trainer = await TrainerModel.findByPk(id, { attributes: ['id', 'availableHours'] });
    if (!trainer) return res.status(404).json({ message: 'Trainer not found' });

    const { availableHours } = req.body || {};
    const normalized = normalizeAvailableHours(availableHours);
    if (!normalized) {
      return res.status(400).json({ message: 'availableHours format is invalid' });
    }

    trainer.availableHours = normalized;
    await trainer.save();

    return res.status(200).json(trainer);
  } catch (error) {
    console.error('[updateTrainerSchedule] Error:', error);
    return res.status(500).json({ message: 'Error updating schedule', error: error.message });
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
