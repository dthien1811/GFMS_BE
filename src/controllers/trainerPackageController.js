// src/controllers/trainerPackageController.js
const db = require("../models");

// Đúng tên model theo index.js của Sequelize
const PackageModel = db.Package || db.package;
const TrainerModel = db.Trainer || db.trainer;
const GymModel = db.Gym || db.gym;

const mustHaveModel = (Model, name) => {
  if (!Model) throw new Error(`Missing Sequelize model: ${name}`);
  return Model;
};

const getTrainerByUserId = async (userId) => {
  mustHaveModel(TrainerModel, "Trainer");
  return TrainerModel.findOne({ where: { userId } });
};

module.exports = {
  // GET /api/pt/packages/me
  async getMyPackages(req, res) {
    try {
      mustHaveModel(PackageModel, "Package");

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthenticated" });

      const trainer = await getTrainerByUserId(userId);
      if (!trainer) return res.status(404).json({ message: "Trainer profile not found" });

      const packages = await PackageModel.findAll({
        where: { trainerId: trainer.id },
        order: [["createdAt", "DESC"]],
      });

      return res.status(200).json({ data: packages });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  },

  // POST /api/pt/packages
  async createPackage(req, res) {
    try {
      mustHaveModel(PackageModel, "Package");

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthenticated" });

      const trainer = await getTrainerByUserId(userId);
      if (!trainer) return res.status(404).json({ message: "Trainer profile not found" });

      // ✅ gymId lấy từ trainer (PT không truyền gymId nữa)
      const gymId = trainer.gymId;
      if (!gymId) return res.status(400).json({ message: "Trainer has no gymId" });

      // check gym tồn tại (nên giữ để tránh trainer.gymId rác)
      mustHaveModel(GymModel, "Gym");
      const gym = await GymModel.findByPk(gymId);
      if (!gym) return res.status(404).json({ message: "gymId not found" });

      const {
        name,
        description,
        type,
        durationDays,
        price,
        sessions,
        // gymId ❌ bỏ
        commissionRate,
        isActive,
        validityType,
        maxSessionsPerWeek,
      } = req.body;

      // validate tối thiểu
      if (!name || String(name).trim() === "") {
        return res.status(400).json({ message: "name is required" });
      }

      const priceNum = Number(price);
      if (price === undefined || price === null || Number.isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ message: "price must be a number >= 0" });
      }

      const sessionsNum = sessions === undefined || sessions === null ? null : Number(sessions);
      if (sessionsNum !== null && (Number.isNaN(sessionsNum) || sessionsNum <= 0)) {
        return res.status(400).json({ message: "sessions must be a positive number" });
      }

      const durationNum =
        durationDays === undefined || durationDays === null ? null : Number(durationDays);
      if (durationNum !== null && (Number.isNaN(durationNum) || durationNum <= 0)) {
        return res.status(400).json({ message: "durationDays must be a positive number" });
      }

      // ✅ sync status/isActive để khỏi lệch
      const active = isActive ?? true;
      const status = active ? "ACTIVE" : "INACTIVE";

      // tính đúng field trong model bạn có
      const pricePerSession =
        sessionsNum && sessionsNum > 0 ? Number((priceNum / sessionsNum).toFixed(2)) : null;

      // tạo record: chỉ dùng đúng các field có trong models/package.js của bạn
      const created = await PackageModel.create({
        name: String(name).trim(),
        description: description ?? null,
        type: type ?? "PT",
        durationDays: durationNum,
        price: priceNum,
        sessions: sessionsNum,
        gymId, // ✅ gymId theo PT
        trainerId: trainer.id,

        status,
        pricePerSession,
        commissionRate: commissionRate ?? trainer.commissionRate ?? 0.6,
        isActive: active,
        validityType: validityType ?? "months",
        maxSessionsPerWeek: maxSessionsPerWeek ?? null,
      });

      return res.status(201).json({ data: created });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  },

  // PUT /api/pt/packages/:id
  async updatePackage(req, res) {
    try {
      mustHaveModel(PackageModel, "Package");

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthenticated" });

      const trainer = await getTrainerByUserId(userId);
      if (!trainer) return res.status(404).json({ message: "Trainer profile not found" });

      const pkg = await PackageModel.findByPk(req.params.id);
      if (!pkg || pkg.trainerId !== trainer.id) {
        return res.status(404).json({ message: "Package not found" });
      }

      const payload = {};
      const allow = [
        "name",
        "description",
        "type",
        "durationDays",
        "price",
        "sessions",
        // "gymId", ❌ chặn đổi gymId để khỏi nhảy gym
        "commissionRate",
        "isActive",
        "validityType",
        "maxSessionsPerWeek",
        // status sẽ sync theo isActive bên dưới, không cho set tay
      ];

      for (const k of allow) {
        if (req.body[k] !== undefined) payload[k] = req.body[k];
      }

      // validate khi update
      if (payload.price !== undefined) {
        const p = Number(payload.price);
        if (Number.isNaN(p) || p < 0) return res.status(400).json({ message: "price must be >= 0" });
        payload.price = p;
      }

      if (payload.sessions !== undefined) {
        const s = payload.sessions === null ? null : Number(payload.sessions);
        if (s !== null && (Number.isNaN(s) || s <= 0)) {
          return res.status(400).json({ message: "sessions must be a positive number" });
        }
        payload.sessions = s;
      }

      if (payload.durationDays !== undefined) {
        const d = payload.durationDays === null ? null : Number(payload.durationDays);
        if (d !== null && (Number.isNaN(d) || d <= 0)) {
          return res.status(400).json({ message: "durationDays must be a positive number" });
        }
        payload.durationDays = d;
      }

      // ✅ sync status nếu update isActive
      if (payload.isActive !== undefined) {
        payload.status = payload.isActive ? "ACTIVE" : "INACTIVE";
      }

      // update pricePerSession nếu đổi price hoặc sessions
      const finalPrice = payload.price !== undefined ? payload.price : Number(pkg.price);
      const finalSessions = payload.sessions !== undefined ? payload.sessions : pkg.sessions;

      if (payload.price !== undefined || payload.sessions !== undefined) {
        payload.pricePerSession =
          finalSessions && Number(finalSessions) > 0
            ? Number((finalPrice / Number(finalSessions)).toFixed(2))
            : null;
      }

      await pkg.update(payload);
      return res.status(200).json({ data: pkg });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  },

  // PATCH /api/pt/packages/:id/toggle
  async togglePackage(req, res) {
    try {
      mustHaveModel(PackageModel, "Package");

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthenticated" });

      const trainer = await getTrainerByUserId(userId);
      if (!trainer) return res.status(404).json({ message: "Trainer profile not found" });

      const pkg = await PackageModel.findByPk(req.params.id);
      if (!pkg || pkg.trainerId !== trainer.id) {
        return res.status(404).json({ message: "Package not found" });
      }

      pkg.isActive = !pkg.isActive;
      pkg.status = pkg.isActive ? "ACTIVE" : "INACTIVE";
      await pkg.save();

      return res.status(200).json({ data: pkg });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  },
};
