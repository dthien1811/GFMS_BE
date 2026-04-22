import db from "../../models";

const getOwnerGymIds = async (ownerId) => {
  const gyms = await db.Gym.findAll({ where: { ownerId }, attributes: ["id"] });
  return gyms.map((g) => Number(g.id));
};

const normalizeMonths = (v) => Number(v || 0);
const normalizePrice = (v) => Number(v || 0);

const controller = {
  async list(req, res) {
    try {
      const ownerId = req.user.id;
      const gymIds = await getOwnerGymIds(ownerId);
      if (!gymIds.length) return res.status(200).json({ data: [] });
      const gymIdQuery = Number(req.query?.gymId || 0);
      const where = gymIdQuery && gymIds.includes(gymIdQuery)
        ? { gymId: gymIdQuery }
        : { gymId: gymIds };

      const rows = await db.MembershipCardPlan.findAll({
        where,
        include: [{ model: db.Gym, attributes: ["id", "name"] }],
        order: [["createdAt", "DESC"]],
      });
      return res.status(200).json({ data: rows });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  },

  async create(req, res) {
    try {
      const ownerId = req.user.id;
      const gymIds = await getOwnerGymIds(ownerId);
      const gymId = Number(req.body?.gymId || 0);
      if (!gymIds.includes(gymId)) return res.status(403).json({ message: "Gym không thuộc quyền quản lý" });

      const months = normalizeMonths(req.body?.months);
      const price = normalizePrice(req.body?.price);
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ message: "Tên thẻ là bắt buộc" });
      if (![1, 2, 3].includes(months)) return res.status(400).json({ message: "Số tháng chỉ hỗ trợ 1/2/3" });
      if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ message: "Giá thẻ không hợp lệ" });

      const duplicated = await db.MembershipCardPlan.findOne({
        where: { gymId, months, isActive: true },
      });
      if (duplicated) {
        return res.status(409).json({ message: `Gym đã có thẻ ${months} tháng đang hoạt động` });
      }

      const row = await db.MembershipCardPlan.create({
        gymId,
        name,
        months,
        price,
        imageUrl: req.body?.imageUrl || null,
        description: req.body?.description || null,
        isActive: req.body?.isActive !== false,
        createdBy: ownerId,
      });
      const created = await db.MembershipCardPlan.findByPk(row.id, {
        include: [{ model: db.Gym, attributes: ["id", "name"] }],
      });
      return res.status(201).json({ data: created });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  },

  async update(req, res) {
    try {
      const ownerId = req.user.id;
      const gymIds = await getOwnerGymIds(ownerId);
      const row = await db.MembershipCardPlan.findByPk(req.params.id);
      if (!row || !gymIds.includes(Number(row.gymId))) {
        return res.status(404).json({ message: "Không tìm thấy thẻ thành viên" });
      }

      const nextName = String(req.body?.name ?? row.name ?? "").trim();
      const nextMonths = req.body?.months !== undefined ? normalizeMonths(req.body?.months) : row.months;
      const nextPrice = req.body?.price !== undefined ? normalizePrice(req.body?.price) : Number(row.price || 0);
      if (!nextName) return res.status(400).json({ message: "Tên thẻ là bắt buộc" });
      if (![1, 2, 3].includes(Number(nextMonths))) return res.status(400).json({ message: "Số tháng chỉ hỗ trợ 1/2/3" });
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) return res.status(400).json({ message: "Giá thẻ không hợp lệ" });

      await row.update({
        name: nextName,
        months: Number(nextMonths),
        price: nextPrice,
        imageUrl: req.body?.imageUrl ?? row.imageUrl,
        description: req.body?.description ?? row.description,
      });
      const updated = await db.MembershipCardPlan.findByPk(row.id, {
        include: [{ model: db.Gym, attributes: ["id", "name"] }],
      });
      return res.status(200).json({ data: updated });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  },

  async toggle(req, res) {
    try {
      const ownerId = req.user.id;
      const gymIds = await getOwnerGymIds(ownerId);
      const row = await db.MembershipCardPlan.findByPk(req.params.id);
      if (!row || !gymIds.includes(Number(row.gymId))) {
        return res.status(404).json({ message: "Không tìm thấy thẻ thành viên" });
      }
      await row.update({ isActive: !row.isActive });
      const updated = await db.MembershipCardPlan.findByPk(row.id, {
        include: [{ model: db.Gym, attributes: ["id", "name"] }],
      });
      return res.status(200).json({ data: updated });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  },
};

export default controller;
