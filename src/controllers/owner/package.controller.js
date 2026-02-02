import db from "../../models";

const Package = db.Package;
const Gym = db.Gym;

// Lấy tất cả gymId của owner (chuẩn cho multi-gym)
const getOwnerGymIds = async (ownerId) => {
  const gyms = await Gym.findAll({
    where: { ownerId },
    attributes: ["id"],
  });
  return gyms.map(g => g.id);
};

const packageController = {

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

      const {
        name,
        description,
        price,
        sessions,
        durationDays,
        gymId
      } = req.body;

      if (!gymIds.includes(gymId)) {
        return res.status(403).json({
          message: "Gym không thuộc quyền quản lý"
        });
      }

      const newPackage = await Package.create({
        name,
        description,
        price,
        sessions,
        durationDays,
        gymId,
        status: 'INACTIVE', // mặc định chưa công bố
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

      const pkg = await Package.findByPk(req.params.id);

      if (!pkg || !gymIds.includes(pkg.gymId)) {
        return res.status(404).json({
          message: "Không tìm thấy gói"
        });
      }

      await pkg.update(req.body);

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

      return res.json({ data: pkg });

    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  },
};

export default packageController;
