import db from "../../models";
import realtimeService from "../../service/realtime.service";

const Package = db.Package;
const Gym = db.Gym;
const Trainer = db.Trainer;
const User = db.User;

const emitPackageChanged = (userIds = [], payload = {}) => {
  [...new Set((userIds || []).filter(Boolean).map(Number))].forEach((userId) => {
    realtimeService.emitUser(userId, "package:changed", payload);
  });
};

const normalizeSpecialization = (value) => String(value || "").trim();

const parseSpecializations = (raw) =>
  String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeSpecializationSelection = (raw) => {
  const dedup = new Map();
  parseSpecializations(raw).forEach((spec) => {
    const key = spec.toLowerCase();
    if (!dedup.has(key)) dedup.set(key, spec);
  });

  return Array.from(dedup.values()).sort((a, b) => a.localeCompare(b, "vi"));
};

const getGymSpecializations = async (gymId) => {
  const trainers = await Trainer.findAll({
    where: {
      gymId,
      isActive: true,
    },
    attributes: ["specialization"],
    raw: true,
  });

  const specMap = new Map();
  trainers.forEach((trainer) => {
    parseSpecializations(trainer.specialization).forEach((spec) => {
      const key = spec.toLowerCase();
      if (!specMap.has(key)) specMap.set(key, spec);
    });
  });

  return Array.from(specMap.values()).sort((a, b) => a.localeCompare(b, "vi"));
};

const getGymSpecializationSet = async (gymId) => {
  const trainers = await getGymSpecializations(gymId);
  const specSet = new Set();
  trainers.forEach((spec) => {
    specSet.add(String(spec).toLowerCase());
  });

  return specSet;
};

// Lấy tất cả gymId của owner (chuẩn cho multi-gym)
const getOwnerGymIds = async (ownerId) => {
  const gyms = await Gym.findAll({
    where: { ownerId },
    attributes: ["id"],
  });
  return gyms.map(g => g.id);
};

const packageController = {

  // ✅ OWNER lấy danh sách chuyên môn PT theo gym
  async getSpecializations(req, res) {
    try {
      const ownerId = req.user.id;
      const gymIds = await getOwnerGymIds(ownerId);

      const gymIdNum = Number(req.query.gymId);
      if (!Number.isInteger(gymIdNum)) {
        return res.status(400).json({ message: "Gym không hợp lệ" });
      }

      if (!gymIds.includes(gymIdNum)) {
        return res.status(403).json({ message: "Gym không thuộc quyền quản lý" });
      }

      const specializations = await getGymSpecializations(gymIdNum);
      return res.status(200).json({ data: specializations });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  },

  // ✅ OWNER lấy PT theo chuyên môn trong gym đã chọn
  async getTrainersBySpecialization(req, res) {
    try {
      const ownerId = req.user.id;
      const gymIds = await getOwnerGymIds(ownerId);

      const gymIdNum = Number(req.query.gymId);
      const specialization = normalizeSpecialization(req.query.specialization);

      if (!Number.isInteger(gymIdNum)) {
        return res.status(400).json({ message: "Gym không hợp lệ" });
      }

      if (!gymIds.includes(gymIdNum)) {
        return res.status(403).json({ message: "Gym không thuộc quyền quản lý" });
      }

      if (!specialization) {
        return res.status(400).json({ message: "Vui lòng chọn chuyên môn" });
      }

      const trainers = await Trainer.findAll({
        where: {
          gymId: gymIdNum,
          isActive: true,
        },
        attributes: ["id", "specialization", "certification", "hourlyRate", "isActive"],
        include: [
          {
            model: User,
            attributes: ["id", "username", "email", "phone"],
          },
        ],
        order: [[User, "username", "ASC"]],
      });

      const selectedSpecs = normalizeSpecializationSelection(specialization).map((s) => s.toLowerCase());
      const filtered = trainers.filter((trainer) => {
        const specs = parseSpecializations(trainer.specialization).map((s) => s.toLowerCase());
        const trainerSpecSet = new Set(specs);
        return selectedSpecs.every((spec) => trainerSpecSet.has(spec));
      });

      return res.status(200).json({ data: filtered });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  },

  // ✅ OWNER xem danh sách package của gym mình
  async getMyPackages(req, res) {
    try {
      const ownerId = req.user.id;

      const gymIds = await getOwnerGymIds(ownerId);

      if (!gymIds.length) {
        return res.status(404).json({
          message: "Owner chưa được gán gym",
          data: [],
        });
      }

      const packages = await Package.findAll({
        where: {
          gymId: gymIds, // Sequelize tự hiểu IN (...)
          name: { [db.Sequelize.Op.ne]: null }, // Loại bỏ các bản ghi có tên NULL
        },
        include: [
          {
            model: Trainer,
            attributes: ["id"],
            required: false,
            include: [
              {
                model: User,
                attributes: ["id", "username"],
              },
            ],
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      // Filter thêm lần nữa để chắc chắn không có bản ghi NULL
      const validPackages = packages.filter(p => p.name && p.id);

      return res.status(200).json({ data: validPackages });

    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Error fetching packages" });
    }
  },

  // ✅ OWNER tạo package (chưa public)
  async createPackage(req, res) {
    try {
      const ownerId = req.user.id;
      const gymIds = await getOwnerGymIds(ownerId);
      const Op = db.Sequelize.Op;

      const {
        name,
        description,
        price,
        sessions,
        gymId,
        type,
        trainerId,
        maxSessionsPerWeek
      } = req.body;

      const gymIdNum = Number(gymId);
      if (!Number.isInteger(gymIdNum)) {
        return res.status(400).json({ message: "Gym không hợp lệ" });
      }

      if (!gymIds.includes(gymIdNum)) {
        return res.status(403).json({
          message: "Gym không thuộc quyền quản lý"
        });
      }

      const normalizedName = String(name || "").trim();
      if (!normalizedName) {
        return res.status(400).json({ message: "Tên gói là bắt buộc" });
      }

      const selectedTypes = normalizeSpecializationSelection(type);
      if (!selectedTypes.length) {
        return res.status(400).json({ message: "Vui lòng chọn chuyên môn PT" });
      }

      const normalizedType = selectedTypes.join(", ");

      const gymSpecSet = await getGymSpecializationSet(gymIdNum);
      const missingSpecs = selectedTypes.filter((spec) => !gymSpecSet.has(spec.toLowerCase()));
      if (missingSpecs.length > 0) {
        return res.status(400).json({
          message: `Chuyên môn PT không tồn tại trong phòng gym đã chọn: ${missingSpecs.join(", ")}`
        });
      }

      const sessionsNum = Number(sessions);
      if (!Number.isFinite(sessionsNum) || sessionsNum <= 0) {
        return res.status(400).json({ message: "Số buổi tập phải lớn hơn 0" });
      }

      const priceNum = Number(price);
      if (!Number.isFinite(priceNum) || priceNum < 0) {
        return res.status(400).json({ message: "Giá gói không hợp lệ" });
      }

      let trainerIdNum = null;
      if (trainerId !== undefined && trainerId !== null && String(trainerId).trim() !== "") {
        trainerIdNum = Number(trainerId);
        if (!Number.isInteger(trainerIdNum)) {
          return res.status(400).json({ message: "Huấn luyện viên không hợp lệ" });
        }

        const trainer = await Trainer.findOne({
          where: {
            id: trainerIdNum,
            gymId: gymIdNum,
            isActive: true,
          },
          attributes: ["id", "specialization"],
        });

        if (!trainer) {
          return res.status(400).json({ message: "Huấn luyện viên không thuộc phòng gym đã chọn" });
        }

        const trainerSpecs = parseSpecializations(trainer.specialization).map((s) => s.toLowerCase());
        const hasMatchingSpec = selectedTypes.every((spec) => trainerSpecs.includes(spec.toLowerCase()));
        if (!hasMatchingSpec) {
          return res.status(400).json({
            message: "Huấn luyện viên không có chuyên môn phù hợp đã chọn"
          });
        }
      }

      const duplicate = await Package.findOne({
        where: {
          gymId: gymIdNum,
          packageType: "personal_training",
          sessions: sessionsNum,
          price: priceNum,
          [Op.and]: [
            db.Sequelize.where(
              db.Sequelize.fn("LOWER", db.Sequelize.col("name")),
              normalizedName.toLowerCase()
            ),
            db.Sequelize.where(
              db.Sequelize.fn("LOWER", db.Sequelize.col("type")),
              normalizedType.toLowerCase()
            ),
          ],
        },
      });

      if (duplicate) {
        return res.status(409).json({
          message: "Gói đã tồn tại (trùng tên, chuyên môn, giá và số buổi)"
        });
      }

      const newPackage = await Package.create({
        name: normalizedName,
        description,
        price: priceNum,
        sessions: sessionsNum,
        durationDays: null,
        gymId: gymIdNum,
        packageType: 'personal_training',
        trainerId: trainerIdNum,
        type: normalizedType,
        validityType: 'sessions',
        maxSessionsPerWeek: maxSessionsPerWeek || null,
        status: 'INACTIVE', // mặc định chưa công bố
      });

      emitPackageChanged([ownerId], {
        packageId: Number(newPackage.id),
        gymId: gymIdNum,
        action: "created",
      });

      return res.status(201).json({ data: newPackage });

    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  },

  // ✅ OWNER cập nhật package
  async updatePackage(req, res) {
    try {
      const ownerId = req.user.id;
      const gymIds = await getOwnerGymIds(ownerId);
      const Op = db.Sequelize.Op;

      const pkg = await Package.findByPk(req.params.id);

      if (!pkg || !gymIds.includes(pkg.gymId)) {
        return res.status(404).json({
          message: "Không tìm thấy gói"
        });
      }

      const nextGymId = Number(req.body?.gymId ?? pkg.gymId);
      if (!Number.isInteger(nextGymId) || !gymIds.includes(nextGymId)) {
        return res.status(403).json({ message: "Gym không thuộc quyền quản lý" });
      }

      const nextName = String(req.body?.name ?? pkg.name ?? "").trim();
      if (!nextName) {
        return res.status(400).json({ message: "Tên gói là bắt buộc" });
      }

      const selectedNextTypes = normalizeSpecializationSelection(req.body?.type ?? pkg.type);
      if (!selectedNextTypes.length) {
        return res.status(400).json({ message: "Vui lòng chọn chuyên môn PT" });
      }

      const nextType = selectedNextTypes.join(", ");

      const gymSpecSet = await getGymSpecializationSet(nextGymId);
      const missingSpecs = selectedNextTypes.filter((spec) => !gymSpecSet.has(spec.toLowerCase()));
      if (missingSpecs.length > 0) {
        return res.status(400).json({
          message: `Chuyên môn PT không tồn tại trong phòng gym đã chọn: ${missingSpecs.join(", ")}`
        });
      }

      const nextSessions = Number(req.body?.sessions ?? pkg.sessions);
      if (!Number.isFinite(nextSessions) || nextSessions <= 0) {
        return res.status(400).json({ message: "Số buổi tập phải lớn hơn 0" });
      }

      const nextPrice = Number(req.body?.price ?? pkg.price);
      if (!Number.isFinite(nextPrice) || nextPrice < 0) {
        return res.status(400).json({ message: "Giá gói không hợp lệ" });
      }

      let nextTrainerId = pkg.trainerId ?? null;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "trainerId")) {
        const rawTrainerId = req.body?.trainerId;
        if (rawTrainerId === null || rawTrainerId === undefined || String(rawTrainerId).trim() === "") {
          nextTrainerId = null;
        } else {
          const parsedTrainerId = Number(rawTrainerId);
          if (!Number.isInteger(parsedTrainerId)) {
            return res.status(400).json({ message: "Huấn luyện viên không hợp lệ" });
          }
          nextTrainerId = parsedTrainerId;
        }
      }

      if (nextTrainerId !== null) {
        const trainer = await Trainer.findOne({
          where: {
            id: nextTrainerId,
            gymId: nextGymId,
            isActive: true,
          },
          attributes: ["id", "specialization"],
        });

        if (!trainer) {
          return res.status(400).json({ message: "Huấn luyện viên không thuộc phòng gym đã chọn" });
        }

        const trainerSpecs = parseSpecializations(trainer.specialization).map((s) => s.toLowerCase());
        const hasMatchingSpec = selectedNextTypes.every((spec) => trainerSpecs.includes(spec.toLowerCase()));
        if (!hasMatchingSpec) {
          return res.status(400).json({ message: "Huấn luyện viên không có chuyên môn phù hợp đã chọn" });
        }
      }

      const duplicate = await Package.findOne({
        where: {
          id: { [Op.ne]: pkg.id },
          gymId: nextGymId,
          packageType: "personal_training",
          sessions: nextSessions,
          price: nextPrice,
          [Op.and]: [
            db.Sequelize.where(
              db.Sequelize.fn("LOWER", db.Sequelize.col("name")),
              nextName.toLowerCase()
            ),
            db.Sequelize.where(
              db.Sequelize.fn("LOWER", db.Sequelize.col("type")),
              nextType.toLowerCase()
            ),
          ],
        },
      });

      if (duplicate) {
        return res.status(409).json({
          message: "Gói đã tồn tại (trùng tên, chuyên môn, giá và số buổi)"
        });
      }

      await pkg.update({
        name: nextName,
        description: req.body?.description ?? pkg.description,
        gymId: nextGymId,
        type: nextType,
        sessions: nextSessions,
        price: nextPrice,
        durationDays: null,
        packageType: 'personal_training',
        trainerId: nextTrainerId,
        validityType: 'sessions',
      });

      emitPackageChanged([ownerId], {
        packageId: Number(pkg.id),
        gymId: Number(pkg.gymId),
        action: "updated",
      });

      return res.json({ data: pkg });

    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  },

  // ✅ OWNER công bố / ngưng gói
  async togglePackage(req, res) {
    try {
      const ownerId = req.user.id;
      const gymIds = await getOwnerGymIds(ownerId);

      const pkg = await Package.findByPk(req.params.id);

      if (!pkg || !gymIds.includes(pkg.gymId)) {
        return res.status(404).json({
          message: "Không tìm thấy gói"
        });
      }

      pkg.status = pkg.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await pkg.save();

      emitPackageChanged([ownerId], {
        packageId: Number(pkg.id),
        gymId: Number(pkg.gymId),
        status: pkg.status,
        action: "toggled",
      });

      return res.json({ data: pkg });

    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  },
};

export default packageController;
