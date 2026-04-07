import db from "../../models";
import { Op } from "sequelize";
import ExcelJS from "exceljs";
import realtimeService from "../realtime.service";

const {
  Commission,
  Gym,
  Trainer,
  User,
  Booking,
  PackageActivation,
  Package,
  PayrollPeriod,
  PayrollItem,
  Withdrawal,
  Policy,
} = db;

const emitCommissionChanged = (userIds = [], payload = {}) => {
  [...new Set((userIds || []).filter(Boolean).map(Number))].forEach((userId) => {
    realtimeService.emitUser(userId, "commission:changed", payload);
  });
};

const parsePaging = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const safeParseJSON = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const ensureGymOwned = async (ownerUserId, gymId) => {
  const gym = await Gym.findOne({ where: { id: gymId, ownerId: ownerUserId } });
  if (!gym) {
    const err = new Error("Không tìm thấy gym hoặc bạn không có quyền.");
    err.statusCode = 403;
    throw err;
  }
  return gym;
};

const buildCommissionQuery = async (ownerUserId, query = {}) => {
  const { gymId, trainerId, status, fromDate, toDate } = query;

  const ownerGyms = await Gym.findAll({
    where: { ownerId: ownerUserId },
    attributes: ["id"],
    raw: true,
  });
  const gymIds = ownerGyms.map((g) => g.id);

  if (gymIds.length === 0) {
    return { where: { id: { [Op.eq]: -1 } }, include: [] };
  }

  const where = { gymId: { [Op.in]: gymIds } };
  if (gymId) where.gymId = Number(gymId);
  if (trainerId) where.trainerId = Number(trainerId);
  if (status) where.status = status;
  if (fromDate || toDate) {
    where.sessionDate = {};
    if (fromDate) where.sessionDate[Op.gte] = new Date(fromDate);
    if (toDate) where.sessionDate[Op.lte] = new Date(toDate);
  }

  const include = [
    { model: Gym, attributes: ["id", "name"], required: false },
    {
      model: Trainer,
      required: false,
      attributes: ["id", "userId"],
      include: [{ model: User, attributes: ["id", "username", "email", "phone"], required: false }],
    },
    { model: Booking, attributes: ["id", "bookingDate", "startTime", "endTime"], required: false },
    {
      model: PackageActivation,
      attributes: ["id", "packageId"],
      required: false,
      include: [{ model: Package, attributes: ["id", "name", "sessions", "price"], required: false }],
    },
  ];

  return { where, include };
};

const ownerCommissionService = {
  async getCommissions(ownerUserId, query = {}) {
    const { page, limit, offset } = parsePaging(query);
    const { where, include } = await buildCommissionQuery(ownerUserId, query);

    const { rows, count } = await Commission.findAndCountAll({
      where,
      include,
      order: [["sessionDate", "DESC"], ["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return {
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  },

  async getCommissionsRaw(ownerUserId, query = {}) {
    const { where, include } = await buildCommissionQuery(ownerUserId, query);
    return Commission.findAll({
      where,
      include,
      order: [["sessionDate", "DESC"], ["createdAt", "DESC"]],
    });
  },

  async getGymCommissionRate(ownerUserId, gymId) {
    await ensureGymOwned(ownerUserId, gymId);
    const policy = await Policy.findOne({
      where: {
        policyType: "commission",
        appliesTo: "gym",
        gymId: Number(gymId),
        isActive: true,
      },
      order: [["createdAt", "DESC"]],
    });

    const value = safeParseJSON(policy?.value, {});
    return {
      gymId: Number(gymId),
      ownerRate: Number(value?.ownerRate ?? 0.15),
      trainerRate: Number(value?.trainerRate ?? 0.85),
      policyId: policy?.id || null,
    };
  },

  async setGymCommissionRate(ownerUserId, payload) {
    const { gymId, ownerRate } = payload || {};
    if (!gymId || ownerRate == null) {
      const err = new Error("Thiếu gymId/ownerRate.");
      err.statusCode = 400;
      throw err;
    }
    const rate = Number(ownerRate);
    if (Number.isNaN(rate) || rate < 0 || rate > 1) {
      const err = new Error("ownerRate phải nằm trong khoảng 0-1.");
      err.statusCode = 400;
      throw err;
    }

    await ensureGymOwned(ownerUserId, gymId);

    const existing = await Policy.findOne({
      where: {
        policyType: "commission",
        appliesTo: "gym",
        gymId: Number(gymId),
        isActive: true,
      },
      order: [["createdAt", "DESC"]],
    });

    const value = {
      ownerRate: rate,
      trainerRate: 1 - rate,
    };

    if (existing) {
      await existing.update({ value });
      emitCommissionChanged([ownerUserId], {
        gymId: Number(gymId),
        action: "rate_updated",
      });
      return existing;
    }

    const policy = await Policy.create({
      policyType: "commission",
      name: "Gym commission rate",
      description: "Tỷ lệ hoa hồng của owner theo gym",
      value,
      isActive: true,
      appliesTo: "gym",
      gymId: Number(gymId),
      effectiveFrom: new Date(),
    });

    emitCommissionChanged([ownerUserId], {
      gymId: Number(gymId),
      policyId: Number(policy.id),
      action: "rate_created",
    });

    return policy;
  },

  async getPayrollPeriods(ownerUserId, query = {}) {
    const { page, limit, offset } = parsePaging(query);
    const { gymId, status } = query;

    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => g.id);

    if (gymIds.length === 0) {
      return { data: [], pagination: { total: 0, page, limit, totalPages: 0 } };
    }

    const where = { gymId: { [Op.in]: gymIds } };
    if (gymId) where.gymId = Number(gymId);
    if (status) where.status = status;

    const { rows, count } = await PayrollPeriod.findAndCountAll({
      where,
      include: [
        { model: Gym, attributes: ["id", "name"], required: false },
        {
          model: PayrollItem,
          as: "items",
          required: false,
          include: [
            {
              model: Trainer,
              attributes: ["id", "userId"],
              required: false,
              include: [{ model: User, attributes: ["id", "username", "email"], required: false }],
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return {
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  },

  async payByTrainer(ownerUserId, payload) {
    const { gymId, trainerId, fromDate, toDate } = payload || {};
    if (!gymId || !trainerId || !fromDate || !toDate) {
      const err = new Error("Thiếu gymId/trainerId/fromDate/toDate.");
      err.statusCode = 400;
      throw err;
    }
    await ensureGymOwned(ownerUserId, gymId);

    const commissions = await Commission.findAll({
      where: {
        gymId: Number(gymId),
        trainerId: Number(trainerId),
        status: "pending",
        payrollPeriodId: null,
        sessionDate: {
          [Op.gte]: new Date(fromDate),
          [Op.lte]: new Date(toDate),
        },
      },
    });

    if (commissions.length === 0) {
      const err = new Error("Không có hoa hồng nào để chi trả.");
      err.statusCode = 400;
      throw err;
    }

    const totalAmount = commissions.reduce((sum, c) => sum + Number(c.commissionAmount || 0), 0);

    await Commission.update(
      { status: "paid", paidAt: new Date() },
      { where: { id: { [Op.in]: commissions.map((c) => c.id) } } }
    );

    const trainer = await Trainer.findByPk(trainerId);
    if (trainer) {
      const current = Number(trainer.pendingCommission || 0);
      await trainer.update({
        pendingCommission: current + totalAmount,
        lastPayoutDate: new Date(),
      });
    }

    emitCommissionChanged([ownerUserId], {
      gymId: Number(gymId),
      trainerId: Number(trainerId),
      action: "paid_by_trainer",
    });

    return { totalAmount, totalSessions: commissions.length };
  },

  async previewPayByTrainer(ownerUserId, payload) {
    const { gymId, trainerId, fromDate, toDate } = payload || {};
    if (!gymId || !trainerId || !fromDate || !toDate) {
      const err = new Error("Thiếu gymId/trainerId/fromDate/toDate.");
      err.statusCode = 400;
      throw err;
    }
    await ensureGymOwned(ownerUserId, gymId);

    const rows = await Commission.findAll({
      where: {
        gymId: Number(gymId),
        trainerId: Number(trainerId),
        status: "pending",
        payrollPeriodId: null,
        sessionDate: {
          [Op.gte]: new Date(fromDate),
          [Op.lte]: new Date(toDate),
        },
      },
      attributes: ["commissionAmount"],
    });

    const totalSessions = rows.length;
    const totalAmount = rows.reduce((sum, r) => sum + Number(r.commissionAmount || 0), 0);

    return { totalSessions, totalAmount };
  },

  async exportCommissions(ownerUserId, query = {}, format = "xlsx") {
    const rows = await ownerCommissionService.getCommissionsRaw(ownerUserId, query);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Commissions");
    sheet.columns = [
      { header: "Ngay buoi tap", key: "sessionDate", width: 16 },
      { header: "Huan luyen vien", key: "trainer", width: 20 },
      { header: "Phong gym", key: "gym", width: 20 },
      { header: "Goi tap", key: "package", width: 20 },
      { header: "Gia tri/buoi", key: "sessionValue", width: 16 },
      { header: "Hoa hong PT", key: "commissionAmount", width: 16 },
      { header: "Trang thai", key: "status", width: 12 },
    ];
    rows.forEach((r) => {
      sheet.addRow({
        sessionDate: r.sessionDate ? new Date(r.sessionDate).toLocaleDateString("vi-VN") : "N/A",
        trainer: r.Trainer?.User?.username || "N/A",
        gym: r.Gym?.name || "N/A",
        package: r.PackageActivation?.Package?.name || "N/A",
        sessionValue: Number(r.sessionValue || 0),
        commissionAmount: Number(r.commissionAmount || 0),
        status: r.status || "N/A",
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return { buffer, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: "commissions.xlsx" };
  },

  async closePayrollPeriod(ownerUserId, payload) {
    const { gymId, startDate, endDate, notes } = payload || {};
    if (!gymId || !startDate || !endDate) {
      const err = new Error("Thiếu gymId/startDate/endDate.");
      err.statusCode = 400;
      throw err;
    }

    await ensureGymOwned(ownerUserId, gymId);

    const commissions = await Commission.findAll({
      where: {
        gymId: Number(gymId),
        status: "pending",
        sessionDate: {
          [Op.gte]: new Date(startDate),
          [Op.lte]: new Date(endDate),
        },
      },
    });

    if (commissions.length === 0) {
      const err = new Error("Không có hoa hồng nào để chốt kỳ.");
      err.statusCode = 400;
      throw err;
    }

    const trainerMap = new Map();
    commissions.forEach((c) => {
      const key = c.trainerId;
      const item = trainerMap.get(key) || { trainerId: key, totalSessions: 0, totalAmount: 0 };
      item.totalSessions += 1;
      item.totalAmount += Number(c.commissionAmount || 0);
      trainerMap.set(key, item);
    });

    const items = Array.from(trainerMap.values());
    const totalSessions = items.reduce((sum, i) => sum + i.totalSessions, 0);
    const totalAmount = items.reduce((sum, i) => sum + i.totalAmount, 0);

    const period = await PayrollPeriod.create({
      gymId: Number(gymId),
      startDate,
      endDate,
      status: "closed",
      totalSessions,
      totalAmount,
      createdBy: ownerUserId,
      notes: notes || null,
    });

    await PayrollItem.bulkCreate(
      items.map((i) => ({
        periodId: period.id,
        trainerId: i.trainerId,
        totalSessions: i.totalSessions,
        totalAmount: i.totalAmount,
      }))
    );

    await Commission.update(
      {
        status: "calculated",
        calculatedAt: new Date(),
        payrollPeriodId: period.id,
      },
      {
        where: {
          id: { [Op.in]: commissions.map((c) => c.id) },
        },
      }
    );

    // Cộng số dư rút được cho PT ngay khi chốt kỳ (không chờ bước "Chi trả")
    for (const item of items) {
      const trainer = await Trainer.findByPk(item.trainerId);
      if (trainer) {
        const current = Number(trainer.pendingCommission || 0);
        await trainer.update({
          pendingCommission: current + Number(item.totalAmount || 0),
          lastPayoutDate: new Date(),
        });
      }
    }
    await period.update({ walletCreditedAt: new Date() });

    emitCommissionChanged([ownerUserId], {
      gymId: Number(gymId),
      periodId: Number(period.id),
      action: "period_closed",
    });

    return PayrollPeriod.findByPk(period.id, {
      include: [
        { model: Gym, attributes: ["id", "name"], required: false },
        {
          model: PayrollItem,
          as: "items",
          required: false,
          include: [
            {
              model: Trainer,
              attributes: ["id", "userId"],
              required: false,
              include: [{ model: User, attributes: ["id", "username", "email"], required: false }],
            },
          ],
        },
      ],
    });
  },

  async previewClosePayrollPeriod(ownerUserId, payload) {
    const { gymId, startDate, endDate } = payload || {};
    if (!gymId || !startDate || !endDate) {
      const err = new Error("Thiếu gymId/startDate/endDate.");
      err.statusCode = 400;
      throw err;
    }

    await ensureGymOwned(ownerUserId, gymId);

    const gym = await ensureGymOwned(ownerUserId, gymId);

    const rows = await Commission.findAll({
      where: {
        gymId: Number(gymId),
        status: "pending",
        sessionDate: {
          [Op.gte]: new Date(startDate),
          [Op.lte]: new Date(endDate),
        },
      },
      attributes: ["trainerId", "commissionAmount"],
      include: [
        {
          model: Trainer,
          attributes: ["id"],
          required: true,
          include: [{ model: User, attributes: ["username", "email"], required: false }],
        },
      ],
    });

    const totalSessions = rows.length;
    const totalAmount = rows.reduce((sum, r) => sum + Number(r.commissionAmount || 0), 0);

    const byTrainer = new Map();
    for (const r of rows) {
      const tid = r.trainerId;
      const prev = byTrainer.get(tid) || {
        trainerId: tid,
        username: r.Trainer?.User?.username || `PT #${tid}`,
        email: r.Trainer?.User?.email || null,
        sessions: 0,
        amount: 0,
      };
      prev.sessions += 1;
      prev.amount += Number(r.commissionAmount || 0);
      byTrainer.set(tid, prev);
    }

    const trainers = Array.from(byTrainer.values()).sort((a, b) =>
      String(a.username || "").localeCompare(String(b.username || ""), "vi")
    );

    return {
      totalSessions,
      totalAmount,
      gymId: Number(gymId),
      gymName: gym.name || "",
      startDate,
      endDate,
      trainers,
    };
  },

  async payPayrollPeriod(ownerUserId, periodId) {
    const period = await PayrollPeriod.findByPk(periodId, {
      include: [
        { model: Gym, attributes: ["id", "ownerId"], required: false },
        { model: PayrollItem, as: "items", required: false },
      ],
    });

    if (!period || period.Gym?.ownerId !== ownerUserId) {
      const err = new Error("Không tìm thấy kỳ lương hoặc bạn không có quyền.");
      err.statusCode = 404;
      throw err;
    }
    if (period.status === "paid") {
      const err = new Error("Kỳ lương đã chi trả.");
      err.statusCode = 400;
      throw err;
    }

    const items = period.items || [];
    // Kỳ chốt trước bản sửa: chưa có walletCreditedAt → vẫn cộng số dư ở đây (một lần)
    if (!period.walletCreditedAt) {
      for (const item of items) {
        const trainer = await Trainer.findByPk(item.trainerId);
        if (trainer) {
          const current = Number(trainer.pendingCommission || 0);
          await trainer.update({
            pendingCommission: current + Number(item.totalAmount || 0),
            lastPayoutDate: new Date(),
          });
        }
      }
    }

    await Commission.update(
      { status: "paid", paidAt: new Date() },
      { where: { payrollPeriodId: period.id } }
    );

    await period.update({
      status: "paid",
      paidAt: new Date(),
      ...(period.walletCreditedAt ? {} : { walletCreditedAt: new Date() }),
    });

    emitCommissionChanged([ownerUserId], {
      gymId: Number(period.gymId),
      periodId: Number(period.id),
      action: "period_paid",
    });

    return PayrollPeriod.findByPk(period.id, {
      include: [
        { model: Gym, attributes: ["id", "name"], required: false },
        {
          model: PayrollItem,
          as: "items",
          required: false,
          include: [
            {
              model: Trainer,
              attributes: ["id", "userId"],
              required: false,
              include: [{ model: User, attributes: ["id", "username", "email"], required: false }],
            },
          ],
        },
      ],
    });
  },
};

export default ownerCommissionService;
