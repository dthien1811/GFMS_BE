import db from "../../models";
import { Op } from "sequelize";
import ExcelJS from "exceljs";
import realtimeService from "../realtime.service";
import ownerRetentionSyncService from "../ownerRetentionSync.service";

const {
  Commission,
  Gym,
  Trainer,
  User,
  Booking,
  Attendance,
  Member,
  PackageActivation,
  Package,
  PayrollPeriod,
  PayrollItem,
  Withdrawal,
  Policy,
} = db;
const ATTENDANCE_EDIT_GRACE_HOURS = Number(process.env.ATTENDANCE_EDIT_GRACE_HOURS || 24);
const PT_REMINDER_AFTER_HOURS = Number(process.env.PT_ATTENDANCE_REMINDER_AFTER_HOURS || 6);
const OWNER_REMINDER_MARKER = "[ATTENDANCE_OWNER_REMINDER]";
const PT_REMINDER_MARKER = "[ATTENDANCE_PT_REMINDER]";

const emitCommissionChanged = (userIds = [], payload = {}) => {
  [...new Set((userIds || []).filter(Boolean).map(Number))].forEach((userId) => {
    realtimeService.emitUser(userId, "commission:changed", payload);
  });
};

const parsePaging = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  // Giới hạn limit để tránh query quá nặng gây timeout
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
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

const appendMarker = (notes, marker, extra = "") => {
  const current = String(notes || "");
  if (current.includes(marker)) return current;
  const line = `${marker}${extra ? ` ${extra}` : ""}`.trim();
  return current ? `${current}\n${line}` : line;
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
    {
      model: Booking,
      attributes: ["id", "bookingDate", "startTime", "endTime", "memberId"],
      required: false,
      include: [
        {
          model: Member,
          attributes: ["id", "userId", "membershipNumber"],
          required: false,
          include: [{ model: User, attributes: ["id", "username", "email", "phone"], required: false }],
        },
      ],
    },
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
    ownerRetentionSyncService.scheduleSyncForOwnerUser(ownerUserId);
    const { page, limit, offset } = parsePaging(query);
    const { where, include } = await buildCommissionQuery(ownerUserId, query);
    const count = await Commission.count({ where });
    if (count === 0) {
      return {
        data: [],
        pagination: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
      };
    }

    // 2-phase query: paginate theo bảng commission trước, rồi mới include các quan hệ.
    // Cách này tránh findAndCountAll + include + distinct quá nặng.
    const idRows = await Commission.findAll({
      where,
      attributes: ["id"],
      order: [["sessionDate", "DESC"], ["createdAt", "DESC"], ["id", "DESC"]],
      limit,
      offset,
      raw: true,
    });
    const ids = idRows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) {
      return {
        data: [],
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      };
    }

    const rows = await Commission.findAll({
      where: { id: { [Op.in]: ids } },
      include,
      order: [["sessionDate", "DESC"], ["createdAt", "DESC"], ["id", "DESC"]],
    });
    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    const sortedRows = ids.map((id) => byId.get(id)).filter(Boolean);

    return {
      data: sortedRows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  },

  async getCommissionsRaw(ownerUserId, query = {}) {
    ownerRetentionSyncService.scheduleSyncForOwnerUser(ownerUserId);
    const { where, include } = await buildCommissionQuery(ownerUserId, query);
    return Commission.findAll({
      where,
      include,
      order: [["sessionDate", "DESC"], ["createdAt", "DESC"]],
    });
  },

  async getPendingAttendanceWindow(ownerUserId, query = {}) {
    const { page, limit } = parsePaging(query);
    const now = new Date();
    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => Number(g.id)).filter((n) => Number.isFinite(n) && n > 0);
    if (!gymIds.length) {
      return { data: [], pagination: { total: 0, page, limit, totalPages: 0 } };
    }

    const minDate = new Date(now.getTime() - (ATTENDANCE_EDIT_GRACE_HOURS + 36) * 60 * 60 * 1000);
    const minYmd = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, "0")}-${String(minDate.getDate()).padStart(2, "0")}`;
    const maxYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const rows = await Booking.findAll({
      where: {
        gymId: { [Op.in]: gymIds },
        status: { [Op.in]: ["confirmed", "in_progress"] },
        bookingDate: { [Op.between]: [minYmd, maxYmd] },
        ...(query.gymId ? { gymId: Number(query.gymId) } : {}),
      },
      attributes: ["id", "gymId", "memberId", "trainerId", "bookingDate", "startTime", "endTime", "status", "sessionType", "notes"],
      include: [
        { model: Gym, attributes: ["id", "name"], required: false },
        {
          model: Trainer,
          attributes: ["id", "userId"],
          required: false,
          include: [{ model: User, attributes: ["id", "username", "email"], required: false }],
        },
        {
          model: Member,
          attributes: ["id", "userId"],
          required: false,
          include: [{ model: User, attributes: ["id", "username", "email"], required: false }],
        },
      ],
      order: [["bookingDate", "DESC"], ["id", "DESC"]],
      limit: 500,
    });

    const slotEnd = (booking) => {
      const dateStr = String(booking?.bookingDate || "").slice(0, 10);
      if (!dateStr) return null;
      let end = String(booking?.endTime || "23:59:59");
      if (end.length === 5) end = `${end}:00`;
      const d = new Date(`${dateStr}T${end}`);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const reminderAt = (booking) => {
      const end = slotEnd(booking);
      if (!end) return null;
      return new Date(end.getTime() + PT_REMINDER_AFTER_HOURS * 60 * 60 * 1000);
    };
    const deadlineAt = (booking) => {
      const end = slotEnd(booking);
      if (!end) return null;
      return new Date(end.getTime() + ATTENDANCE_EDIT_GRACE_HOURS * 60 * 60 * 1000);
    };

    const bookingIds = rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
    const attendances = bookingIds.length
      ? await Attendance.findAll({
          where: { bookingId: { [Op.in]: bookingIds }, attendanceType: "trainer" },
          attributes: ["bookingId", "userId", "status"],
        })
      : [];
    const attByBookingId = new Map();
    attendances.forEach((a) => {
      const key = Number(a.bookingId);
      const list = attByBookingId.get(key) || [];
      list.push(a);
      attByBookingId.set(key, list);
    });

    const waiting = rows
      .filter((b) => String(b?.sessionType || "").toLowerCase() !== "trainer_share")
      .map((b) => {
        const end = slotEnd(b);
        const remind = reminderAt(b);
        const deadline = deadlineAt(b);
        if (!end || !remind || !deadline) return null;
        const notes = String(b?.notes || "");
        const hasReminderMarker =
          notes.includes(OWNER_REMINDER_MARKER) || notes.includes(PT_REMINDER_MARKER);
        const inAutoReminderWindow = now >= remind && now < deadline;
        const inManualReminderWindow = hasReminderMarker && now < deadline;
        if (!(inAutoReminderWindow || inManualReminderWindow)) return null;
        const trainerUserId = Number(b?.Trainer?.userId || 0);
        const atts = attByBookingId.get(Number(b.id)) || [];
        const hasTrainerAttendance = atts.some((a) => Number(a.userId) === trainerUserId);
        if (hasTrainerAttendance) return null;
        return {
          bookingId: b.id,
          gymId: b.gymId,
          gymName: b?.Gym?.name || null,
          trainerId: b?.Trainer?.id || b.trainerId || null,
          trainerName: b?.Trainer?.User?.username || null,
          trainerEmail: b?.Trainer?.User?.email || null,
          memberId: b?.Member?.id || b.memberId || null,
          memberName: b?.Member?.User?.username || null,
          memberEmail: b?.Member?.User?.email || null,
          bookingDate: b.bookingDate,
          startTime: b.startTime,
          endTime: b.endTime,
          status: b.status,
          reminderAt: remind,
          attendanceDeadline: deadline,
          remainingMs: Math.max(0, deadline.getTime() - now.getTime()),
          reminded: hasReminderMarker,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.attendanceDeadline).getTime() - new Date(b.attendanceDeadline).getTime());

    const total = waiting.length;
    const offset = (page - 1) * limit;
    const data = waiting.slice(offset, offset + limit);
    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  },

  async remindPendingAttendance(ownerUserId, bookingId) {
    const id = Number(bookingId);
    if (!Number.isFinite(id) || id <= 0) {
      const err = new Error("bookingId không hợp lệ.");
      err.statusCode = 400;
      throw err;
    }

    const booking = await Booking.findByPk(id, {
      attributes: ["id", "gymId", "memberId", "trainerId", "bookingDate", "startTime", "endTime", "status", "sessionType", "notes"],
      include: [
        { model: Gym, attributes: ["id", "name", "ownerId"], required: false },
        {
          model: Trainer,
          attributes: ["id", "userId"],
          required: false,
          include: [{ model: User, attributes: ["id", "username", "email"], required: false }],
        },
        {
          model: Member,
          attributes: ["id", "userId"],
          required: false,
          include: [{ model: User, attributes: ["id", "username", "email"], required: false }],
        },
      ],
    });

    if (!booking) {
      const err = new Error("Không tìm thấy buổi tập.");
      err.statusCode = 404;
      throw err;
    }

    if (Number(booking?.Gym?.ownerId || 0) !== Number(ownerUserId || 0)) {
      const err = new Error("Bạn không có quyền nhắc PT cho buổi tập này.");
      err.statusCode = 403;
      throw err;
    }

    if (!["confirmed", "in_progress"].includes(String(booking.status || "").toLowerCase())) {
      const err = new Error("Buổi tập này không còn ở trạng thái chờ điểm danh.");
      err.statusCode = 400;
      throw err;
    }

    if (String(booking?.sessionType || "").toLowerCase() === "trainer_share") {
      const err = new Error("Buổi trainer share không áp dụng nhắc điểm danh theo flow này.");
      err.statusCode = 400;
      throw err;
    }

    const dateStr = String(booking?.bookingDate || "").slice(0, 10);
    let end = String(booking?.endTime || "23:59:59");
    if (end.length === 5) end = `${end}:00`;
    const endAt = new Date(`${dateStr}T${end}`);
    if (Number.isNaN(endAt.getTime())) {
      const err = new Error("Không thể xác định thời gian kết thúc buổi tập.");
      err.statusCode = 400;
      throw err;
    }

    const now = new Date();
    const deadline = new Date(endAt.getTime() + ATTENDANCE_EDIT_GRACE_HOURS * 60 * 60 * 1000);
    if (now < endAt) {
      const err = new Error("Buổi tập chưa kết thúc, chưa thể gửi nhắc PT.");
      err.statusCode = 400;
      throw err;
    }
    if (now >= deadline) {
      const err = new Error("Buổi tập đã quá hạn điểm danh, không thể gửi nhắc thủ công.");
      err.statusCode = 400;
      throw err;
    }

    const trainerUserId = Number(booking?.Trainer?.userId || 0);
    if (!trainerUserId) {
      const err = new Error("Không tìm thấy tài khoản PT để gửi nhắc nhở.");
      err.statusCode = 400;
      throw err;
    }

    const trainerAtt = await Attendance.findOne({
      where: {
        bookingId: booking.id,
        attendanceType: "trainer",
        userId: trainerUserId,
      },
      attributes: ["id"],
    });
    if (trainerAtt) {
      const err = new Error("PT đã điểm danh buổi này, không cần gửi nhắc.");
      err.statusCode = 400;
      throw err;
    }

    const trainerName = booking?.Trainer?.User?.username || `PT #${booking?.Trainer?.id || booking?.trainerId || "?"}`;
    const memberName = booking?.Member?.User?.username || `Hội viên #${booking?.memberId || "?"}`;
    const gymName = booking?.Gym?.name || "phòng tập";
    const dateLabel = new Date(`${dateStr}T00:00:00`).toLocaleDateString("vi-VN");
    const timeLabel = `${String(booking?.startTime || "").slice(0, 5)}-${String(booking?.endTime || "").slice(0, 5)}`;
    const deadlineLabel = deadline.toLocaleString("vi-VN");

    await realtimeService.notifyUser(trainerUserId, {
      title: "Owner nhắc điểm danh buổi tập",
      message: `Bạn chưa điểm danh buổi ${dateLabel} (${timeLabel}) với ${memberName} tại ${gymName}. Vui lòng cập nhật trước ${deadlineLabel}.`,
      notificationType: "booking_update",
      relatedType: "booking",
      relatedId: booking.id,
    });

    const nextNotes = appendMarker(booking.notes, OWNER_REMINDER_MARKER, new Date().toISOString());
    if (nextNotes !== String(booking.notes || "")) {
      booking.notes = nextNotes;
      await booking.save({ fields: ["notes", "updatedAt"] });
    }

    emitCommissionChanged([ownerUserId], {
      gymId: Number(booking.gymId),
      bookingId: Number(booking.id),
      action: "owner_manual_attendance_reminder",
    });

    return {
      bookingId: Number(booking.id),
      trainerName,
      trainerEmail: booking?.Trainer?.User?.email || null,
      memberName,
      gymName,
      attendanceDeadline: deadline,
      reminderSentAt: now,
    };
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

    const periodIdsNeedFallback = rows
      .filter((p) => !Array.isArray(p.items) || p.items.length === 0)
      .map((p) => Number(p.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    let groupedByPeriodTrainer = [];
    if (periodIdsNeedFallback.length > 0) {
      groupedByPeriodTrainer = await Commission.findAll({
        where: {
          payrollPeriodId: { [Op.in]: periodIdsNeedFallback },
          payee: { [Op.or]: [null, "trainer"] },
        },
        attributes: [
          "payrollPeriodId",
          "trainerId",
          [db.Sequelize.fn("COUNT", db.Sequelize.col("Commission.id")), "totalSessions"],
          [
            db.Sequelize.fn(
              "COALESCE",
              db.Sequelize.fn("SUM", db.Sequelize.col("Commission.commissionAmount")),
              0
            ),
            "totalAmount",
          ],
        ],
        include: [
          {
            model: Trainer,
            attributes: ["id", "userId"],
            required: false,
            include: [{ model: User, attributes: ["id", "username", "email"], required: false }],
          },
        ],
        group: ["payrollPeriodId", "trainerId", "Trainer.id", "Trainer->User.id"],
        raw: false,
      });
    }

    const fallbackMap = new Map();
    groupedByPeriodTrainer.forEach((row) => {
      const periodId = Number(row.payrollPeriodId);
      const list = fallbackMap.get(periodId) || [];
      list.push({
        id: `fallback-${periodId}-${row.trainerId}`,
        trainerId: Number(row.trainerId),
        totalSessions: Number(row.get("totalSessions") || 0),
        totalAmount: Number(row.get("totalAmount") || 0),
        Trainer: row.Trainer || null,
      });
      fallbackMap.set(periodId, list);
    });

    const mergedRows = rows.map((period) => {
      const plain = period.toJSON ? period.toJSON() : period;
      if (Array.isArray(plain.items) && plain.items.length > 0) return plain;
      const fallbackItems = fallbackMap.get(Number(plain.id)) || [];
      return {
        ...plain,
        items: fallbackItems,
      };
    });

    return {
      data: mergedRows,
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
        ...ownerRetentionSyncService.trainerPayeeOrNullWhere(),
      },
    });

    if (commissions.length === 0) {
      const err = new Error("Không có hoa hồng nào để chi trả.");
      err.statusCode = 400;
      throw err;
    }

    const totalAmount = commissions.reduce((sum, c) => sum + Number(c.commissionAmount || 0), 0);
    const paidAt = new Date();

    // Khi chi trả trực tiếp theo PT, vẫn ghi nhận 1 payroll period (status=paid)
    // để lịch sử "Kỳ lương đã chốt" luôn đầy đủ.
    const t = await db.sequelize.transaction();
    let periodId = null;
    try {
      const period = await PayrollPeriod.create(
        {
          gymId: Number(gymId),
          startDate: fromDate,
          endDate: toDate,
          status: "paid",
          totalSessions: commissions.length,
          totalAmount,
          createdBy: ownerUserId,
          paidAt,
          walletCreditedAt: paidAt,
          notes: `Chi trả trực tiếp theo huấn luyện viên #${trainerId}`,
        },
        { transaction: t }
      );
      periodId = Number(period.id);

      await PayrollItem.create(
        {
          periodId,
          trainerId: Number(trainerId),
          totalSessions: commissions.length,
          totalAmount,
        },
        { transaction: t }
      );

      await Commission.update(
        { status: "paid", paidAt, calculatedAt: paidAt, payrollPeriodId: periodId },
        { where: { id: { [Op.in]: commissions.map((c) => c.id) } }, transaction: t }
      );

      const trainer = await Trainer.findByPk(trainerId, { transaction: t });
      if (trainer) {
        const current = Number(trainer.pendingCommission || 0);
        await trainer.update(
          {
            pendingCommission: current + totalAmount,
            lastPayoutDate: paidAt,
          },
          { transaction: t }
        );
      }

      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }

    emitCommissionChanged([ownerUserId], {
      gymId: Number(gymId),
      trainerId: Number(trainerId),
      periodId,
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
        ...ownerRetentionSyncService.trainerPayeeOrNullWhere(),
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
      { header: "Loai", key: "payee", width: 14 },
      { header: "Ghi chu", key: "note", width: 40 },
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
        payee: r.payee === "owner" ? "Chu phong tap" : "PT",
        note: r.retentionReason || "",
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
        ...ownerRetentionSyncService.trainerPayeeOrNullWhere(),
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
        ...ownerRetentionSyncService.trainerPayeeOrNullWhere(),
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
