"use strict";

const { Op } = require("sequelize");
const {
  sequelize,

  // Core
  User,
  Gym,
  Member,

  // RBAC
  Group,

  // Module 2
  Maintenance,
  Equipment,
  EquipmentStock,
  EquipmentUnit,

  // Module 3
  FranchiseRequest,

  // Module 4
  Policy,

  // Module 5
  TrainerShare,
  Trainer,

  // Module 6
  AuditLog,
  Notification,
  Message,

  // Reports
  Transaction,
  Booking,
  Attendance,
  SessionProgress,
  Inventory,
  Receipt,
  PurchaseOrder,
  PurchaseRequest,
  EquipmentCombo,
} = require("../models");
const realtimeServiceModule = require("./realtime.service");
const realtimeService = realtimeServiceModule.default || realtimeServiceModule;
const notificationGymService = require("./notification-gym.service");
const { attachGymIdsToNotifications } = notificationGymService;
const equipmentUnitEventUtils = require("../utils/equipmentUnitEvent");
const { logEquipmentUnitEvents } = equipmentUnitEventUtils;

/** ========= Helpers ========= */

function getActorId(req) {
  return (
    req?.user?.id ||
    req?.user?.user?.id ||
    req?.user?.DT?.id ||
    req?.user?.DT?.user?.id ||
    null
  );
}

function parsePaging(query) {
  const page = Math.max(1, parseInt(query.page || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(query.limit || "10", 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function toISODateStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function toISODateEnd(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function emitMaintenanceChanged(userIds = [], payload = {}) {
  [...new Set((userIds || []).filter(Boolean).map(Number))].forEach((userId) => {
    realtimeService.emitUser(userId, "maintenance:changed", payload);
  });
}

async function logMaintenanceUnitEvent({
  maintenance,
  transaction,
  eventType,
  performedBy,
  eventAt,
  notes,
  metadata,
}) {
  if (!maintenance?.equipmentUnitId || !maintenance?.equipmentId) return;

  await logEquipmentUnitEvents(
    [
      {
        equipmentUnitId: Number(maintenance.equipmentUnitId),
        equipmentId: Number(maintenance.equipmentId),
        gymId: Number(maintenance.gymId),
        eventType,
        referenceType: "maintenance",
        referenceId: Number(maintenance.id),
        performedBy: performedBy || null,
        notes: notes ?? maintenance.issueDescription ?? null,
        metadata: {
          maintenanceStatus: maintenance.status,
          assignedTo: maintenance.assignedTo || null,
          requestedBy: maintenance.requestedBy || null,
          ...metadata,
        },
        eventAt: eventAt || new Date(),
      },
    ],
    { transaction }
  );
}

async function restoreMaintenanceUnitAndStock(m, t) {
  if (!m?.equipmentId || !m?.gymId) return;

  let sourceUsageStatus = "in_stock";

  if (m.equipmentUnitId) {
    const unit = await EquipmentUnit.findByPk(m.equipmentUnitId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (unit) {
      sourceUsageStatus = unit.usageStatus || "in_stock";
      await unit.update(
        {
          status: "active",
          usageStatus: unit.usageStatus || "in_stock",
          transferId: null,
        },
        { transaction: t }
      );
    }
  }

  const stock = await EquipmentStock.findOne({
    where: { gymId: m.gymId, equipmentId: m.equipmentId },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (stock) {
    if (sourceUsageStatus === "in_stock") {
      await stock.update(
        {
          availableQuantity: Number(stock.availableQuantity || 0) + 1,
          reservedQuantity: Math.max(0, Number(stock.reservedQuantity || 0) - 1),
        },
        { transaction: t }
      );
    }
  }
}

async function createAudit({ t, req, action, tableName, recordId, oldValues, newValues }) {
  const userId = getActorId(req);
  return AuditLog.create(
    {
      userId,
      action,
      tableName,
      recordId,
      oldValues: oldValues ?? null,
      newValues: newValues ?? null,
      ipAddress: req?.ip,
      userAgent: req?.headers?.["user-agent"],
    },
    { transaction: t }
  );
}

async function notifyUser({ t, userId, title, message, notificationType, relatedType, relatedId }) {
  if (!userId) return null;
  const row = await Notification.create(
    {
      userId,
      title,
      message,
      notificationType: notificationType || null,
      relatedType: relatedType || null,
      relatedId: relatedId || null,
      isRead: false,
    },
    { transaction: t }
  );

  const payload = {
    id: row.id,
    title,
    message,
    notificationType: notificationType || null,
    relatedType: relatedType || null,
    relatedId: relatedId || null,
    isRead: false,
    createdAt: row.createdAt,
  };

  const [enrichedPayload] = await attachGymIdsToNotifications([payload]);

  if (t?.afterCommit) {
    t.afterCommit(() => {
      realtimeService.emitUser(userId, "notification:new", enrichedPayload);
    });
  } else {
    realtimeService.emitUser(userId, "notification:new", enrichedPayload);
  }

  return row;
}

async function sendMessage({ t, senderId, receiverId, content }) {
  if (!senderId || !receiverId) return null;
  return Message.create(
    {
      senderId,
      receiverId,
      content,
      isRead: false,
    },
    { transaction: t }
  );
}

function ensure(cond, msg, statusCode = 400) {
  if (!cond) {
    const e = new Error(msg);
    e.statusCode = statusCode;
    throw e;
  }
}

function safeJson(modelInstance) {
  return modelInstance?.toJSON ? modelInstance.toJSON() : modelInstance;
}

/**
 * FIX: chặn select Equipment.gymId (DB không có cột này)
 */
function safeEquipmentInclude(extra = {}) {
  return {
    model: Equipment,
    required: false,
    attributes: { exclude: ["gymId"] },
    ...extra,
  };
}

/** ========= Service ========= */

class AdminAdminCoreService {
  /* ======================================================
   * MODULE 2: MAINTENANCE
   * ====================================================== */

  async getMaintenances(req) {
    const { page, limit, offset } = parsePaging(req.query);
    const { status, gymId, q } = req.query;

    const where = {};
    if (status) where.status = status;
    if (gymId) where.gymId = Number(gymId);

    if (q) {
      where[Op.or] = [
        { issueDescription: { [Op.like]: `%${q}%` } },
        { notes: { [Op.like]: `%${q}%` } },
      ];
    }

    const { rows, count } = await Maintenance.findAndCountAll({
      where,
      include: [
        safeEquipmentInclude(),
        { model: Gym, required: false },
        { model: User, as: "requester", required: false },
        { model: User, as: "technician", required: false },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return {
      data: rows,
      meta: {
        page,
        limit,
        totalItems: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }
// ✅ FIX #2: getTechnicians KHÔNG query Role.name nữa (vì DB role không có name)
async getTechnicians(req) {
  // Mục tiêu: trả danh sách user dùng cho dropdown Assign Technician.
  // DB mỗi bạn có thể khác nhau (có thể dùng groupId hoặc roleId), nên làm linh hoạt.

  // 1) detect cột groupId/roleId trong bảng user
  let userCols = {};
  try {
    userCols = await sequelize.getQueryInterface().describeTable("user");
  } catch (e) {
    // một số DB đặt table là `users`
    try {
      userCols = await sequelize.getQueryInterface().describeTable("users");
    } catch (_) {
      userCols = {};
    }
  }

  const hasGroupId = !!userCols.groupId;
  const hasRoleId = !!userCols.roleId;

  // 2) Ưu tiên tìm group có tên chứa "tech"/"technician" (không phân biệt hoa thường)
  let technicianGroupId = null;
  if (hasGroupId) {
    const techGroup = await Group.findOne({
      where: sequelize.where(
        sequelize.fn("LOWER", sequelize.col("name")),
        { [Op.like]: "%tech%" }
      ),
      attributes: ["id", "name"],
    });
    technicianGroupId = techGroup?.id || null;
  }

  // 3) Build where
  const where = {};
  if (hasGroupId && technicianGroupId) {
    where.groupId = technicianGroupId;
  } else if (hasGroupId) {
    // fallback cứng groupId=6 (theo DB bạn chụp trước đó)
    where.groupId = 6;
  } else if (hasRoleId) {
    // fallback nếu user dùng roleId (không có groupId)
    // Không đoán tên role ở đây để tránh lỗi; trả toàn bộ user, FE vẫn chọn được.
    // Nếu bạn muốn siết role technician, mình sẽ map theo bảng role của bạn.
  }

  const attrs = ["id", "username", "email"];
  if (hasGroupId) attrs.push("groupId");
  if (hasRoleId) attrs.push("roleId");

  const users = await User.findAll({
    where,
    attributes: attrs,
    order: [["id", "ASC"]],
  });

  return { data: users };
}

  async getMaintenanceDetail(req) {
    const id = Number(req.params.id);
    ensure(id, "Invalid maintenance id");

    const m = await Maintenance.findByPk(id, {
      include: [
        safeEquipmentInclude(),
        { model: Gym, required: false },
        { model: User, as: "requester", required: false },
        { model: User, as: "technician", required: false },
      ],
    });
    ensure(m, "Maintenance not found", 404);
    return m;
  }

  // ✅ FIX #1: approve phải đổi status
  async approveMaintenance(req) {
    const id = Number(req.params.id);
    const actorId = getActorId(req);
    ensure(actorId, "Missing actor (req.user)", 401);

    const { scheduledDate, estimatedCost, notes } = req.body || {};
    ensure(scheduledDate, "scheduledDate is required");

    return sequelize.transaction(async (t) => {
      const m = await Maintenance.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      ensure(m, "Maintenance not found", 404);
      ensure(m.status === "pending", "Only pending maintenance can be approved");

      const oldValues = safeJson(m);

      await m.update(
        {
          status: "approve", // ✅ quan trọng: đổi status sang approve
          scheduledDate: new Date(scheduledDate),
          estimatedCost: estimatedCost ?? m.estimatedCost,
          notes: notes ?? m.notes,
        },
        { transaction: t }
      );

      await createAudit({
        t,
        req,
        action: "MAINTENANCE_APPROVED",
        tableName: "maintenance",
        recordId: m.id,
        oldValues,
        newValues: safeJson(m),
      });

      await notifyUser({
        t,
        userId: m.requestedBy,
        title: "Yêu cầu bảo trì đã được duyệt",
        message: `Admin đã duyệt yêu cầu bảo trì #${m.id}. Lịch dự kiến: ${new Date(
          scheduledDate
        ).toLocaleString()}`,
        notificationType: "MAINTENANCE",
        relatedType: "maintenance",
        relatedId: m.id,
      });

      await logMaintenanceUnitEvent({
        maintenance: m,
        transaction: t,
        eventType: "maintenance_approved",
        performedBy: actorId,
        eventAt: m.updatedAt || new Date(),
        notes: notes ?? m.issueDescription ?? null,
        metadata: {
          scheduledDate: m.scheduledDate,
          estimatedCost: m.estimatedCost,
        },
      });

      await sendMessage({
        t,
        senderId: actorId,
        receiverId: m.requestedBy,
        content: `Yêu cầu bảo trì #${m.id} đã được duyệt. Lịch: ${new Date(
          scheduledDate
        ).toLocaleString()}.`,
      });

      emitMaintenanceChanged([m.requestedBy], {
        maintenanceId: m.id,
        equipmentId: m.equipmentId,
        equipmentUnitId: m.equipmentUnitId || null,
        gymId: m.gymId,
        status: m.status,
        action: "approved",
      });

      return m;
    });
  }

  async rejectMaintenance(req) {
    const id = Number(req.params.id);
    const actorId = getActorId(req);
    ensure(actorId, "Missing actor (req.user)", 401);

    const { reason } = req.body || {};
    ensure(reason && String(reason).trim(), "reason is required");

    return sequelize.transaction(async (t) => {
      const m = await Maintenance.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      ensure(m, "Maintenance not found", 404);

      // cho reject cả pending / approve / assigned
      ensure(
        ["pending", "approve", "assigned"].includes(m.status),
        "Only pending/approve/assigned maintenance can be rejected"
      );

      const oldValues = safeJson(m);

      await m.update(
        {
          status: "cancelled",
          notes: m.notes ? `${m.notes}\n[REJECT_REASON]: ${reason}` : `[REJECT_REASON]: ${reason}`,
        },
        { transaction: t }
      );

      await restoreMaintenanceUnitAndStock(m, t);

      await createAudit({
        t,
        req,
        action: "MAINTENANCE_REJECTED",
        tableName: "maintenance",
        recordId: m.id,
        oldValues,
        newValues: safeJson(m),
      });

      await logMaintenanceUnitEvent({
        maintenance: m,
        transaction: t,
        eventType: "maintenance_rejected",
        performedBy: actorId,
        eventAt: m.updatedAt || new Date(),
        notes: reason,
        metadata: {
          reason,
        },
      });

      await notifyUser({
        t,
        userId: m.requestedBy,
        title: "Yêu cầu bảo trì bị từ chối",
        message: `Yêu cầu bảo trì #${m.id} bị từ chối. Lý do: ${reason}`,
        notificationType: "MAINTENANCE",
        relatedType: "maintenance",
        relatedId: m.id,
      });

      await sendMessage({
        t,
        senderId: actorId,
        receiverId: m.requestedBy,
        content: `Yêu cầu bảo trì #${m.id} bị từ chối. Lý do: ${reason}`,
      });

      emitMaintenanceChanged([m.requestedBy], {
        maintenanceId: m.id,
        equipmentId: m.equipmentId,
        equipmentUnitId: m.equipmentUnitId || null,
        gymId: m.gymId,
        status: m.status,
        action: "rejected",
      });

      return m;
    });
  }

  async assignMaintenance(req) {
    const id = Number(req.params.id);
    const actorId = getActorId(req);
    ensure(actorId, "Missing actor (req.user)", 401);

    const { assignedTo } = req.body || {};
    ensure(assignedTo, "assignedTo is required");

    return sequelize.transaction(async (t) => {
      const m = await Maintenance.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      ensure(m, "Maintenance not found", 404);

      // cho assign khi pending/approve/assigned
      ensure(
        ["pending", "approve", "assigned"].includes(m.status),
        "Only pending/approve/assigned maintenance can be assigned"
      );

      const tech = await User.findByPk(Number(assignedTo), { transaction: t });
      ensure(tech, "Technician user not found");

      const oldValues = safeJson(m);

      await m.update(
        {
          assignedTo: Number(assignedTo),
          status: "assigned",
        },
        { transaction: t }
      );

      await createAudit({
        t,
        req,
        action: "MAINTENANCE_ASSIGNED",
        tableName: "maintenance",
        recordId: m.id,
        oldValues,
        newValues: safeJson(m),
      });

      await logMaintenanceUnitEvent({
        maintenance: m,
        transaction: t,
        eventType: "maintenance_assigned",
        performedBy: actorId,
        eventAt: m.updatedAt || new Date(),
        notes: m.issueDescription || null,
        metadata: {
          assignedTo: m.assignedTo,
          technicianName: tech.username || null,
        },
      });

      await notifyUser({
        t,
        userId: m.assignedTo,
        title: "Bạn được phân công bảo trì",
        message: `Bạn được phân công xử lý bảo trì #${m.id}.`,
        notificationType: "MAINTENANCE",
        relatedType: "maintenance",
        relatedId: m.id,
      });

      await notifyUser({
        t,
        userId: m.requestedBy,
        title: "Yêu cầu bảo trì đã được phân công kỹ thuật",
        message: `Yêu cầu #${m.id} đã được phân công cho kỹ thuật (userId=${assignedTo}).`,
        notificationType: "MAINTENANCE",
        relatedType: "maintenance",
        relatedId: m.id,
      });

      await sendMessage({
        t,
        senderId: actorId,
        receiverId: m.assignedTo,
        content: `Bạn được phân công xử lý bảo trì #${m.id}. Vui lòng vào hệ thống để cập nhật tiến độ.`,
      });

      emitMaintenanceChanged([m.requestedBy], {
        maintenanceId: m.id,
        equipmentId: m.equipmentId,
        equipmentUnitId: m.equipmentUnitId || null,
        gymId: m.gymId,
        status: m.status,
        action: "assigned",
      });

      return m;
    });
  }

  async startMaintenance(req) {
    const id = Number(req.params.id);
    const actorId = getActorId(req);
    ensure(actorId, "Missing actor (req.user)", 401);

    return sequelize.transaction(async (t) => {
      const m = await Maintenance.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      ensure(m, "Maintenance not found", 404);
      ensure(["approve", "assigned"].includes(m.status), "Only approved/assigned maintenance can be started");

      const oldValues = safeJson(m);

      await m.update({ status: "in_progress" }, { transaction: t });

      await createAudit({
        t,
        req,
        action: "MAINTENANCE_STARTED",
        tableName: "maintenance",
        recordId: m.id,
        oldValues,
        newValues: safeJson(m),
      });

      await logMaintenanceUnitEvent({
        maintenance: m,
        transaction: t,
        eventType: "maintenance_started",
        performedBy: actorId,
        eventAt: m.updatedAt || new Date(),
        metadata: {
          assignedTo: m.assignedTo || null,
        },
      });

      await notifyUser({
        t,
        userId: m.requestedBy,
        title: "Bảo trì đã bắt đầu",
        message: `Bảo trì #${m.id} đã bắt đầu xử lý.`,
        notificationType: "MAINTENANCE",
        relatedType: "maintenance",
        relatedId: m.id,
      });

      emitMaintenanceChanged([m.requestedBy], {
        maintenanceId: m.id,
        equipmentId: m.equipmentId,
        equipmentUnitId: m.equipmentUnitId || null,
        gymId: m.gymId,
        status: m.status,
        action: "started",
      });

      return m;
    });
  }

  async completeMaintenance(req) {
    const id = Number(req.params.id);
    const actorId = getActorId(req);
    ensure(actorId, "Missing actor (req.user)", 401);

    const { completionDate } = req.body || {};

    return sequelize.transaction(async (t) => {
      const m = await Maintenance.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      ensure(m, "Maintenance not found", 404);

      ensure(
        ["in_progress", "assigned"].includes(m.status),
        "Only in_progress/assigned maintenance can be completed"
      );

      const oldValues = safeJson(m);

      await m.update(
        {
          status: "completed",
          completionDate: completionDate ? new Date(completionDate) : new Date(),
        },
        { transaction: t }
      );

      await restoreMaintenanceUnitAndStock(m, t);

      await createAudit({
        t,
        req,
        action: "MAINTENANCE_COMPLETED",
        tableName: "maintenance",
        recordId: m.id,
        oldValues,
        newValues: safeJson(m),
      });

      await logMaintenanceUnitEvent({
        maintenance: m,
        transaction: t,
        eventType: "maintenance_completed",
        performedBy: actorId,
        eventAt: m.completionDate || m.updatedAt || new Date(),
        metadata: {
          completionDate: m.completionDate,
          transactionId: null,
        },
      });

      await notifyUser({
        t,
        userId: m.requestedBy,
        title: "Bảo trì đã hoàn tất",
        message: `Bảo trì #${m.id} đã hoàn tất.`,
        notificationType: "MAINTENANCE",
        relatedType: "maintenance",
        relatedId: m.id,
      });

      if (m.assignedTo) {
        await notifyUser({
          t,
          userId: m.assignedTo,
          title: "Bảo trì đã được hoàn tất",
          message: `Bạn đã hoàn tất bảo trì #${m.id}.`,
          notificationType: "MAINTENANCE",
          relatedType: "maintenance",
          relatedId: m.id,
        });
      }

      emitMaintenanceChanged([m.requestedBy, m.assignedTo], {
        maintenanceId: m.id,
        equipmentId: m.equipmentId,
        equipmentUnitId: m.equipmentUnitId || null,
        gymId: m.gymId,
        status: m.status,
        action: "completed",
      });

      return { maintenance: m };
    });
  }

  // ✅ FIX #2: getTechnicians KHÔNG query Role.name nữa (vì DB role không có name)
  async getTechnicians(req) {
    // 1) ưu tiên tìm group theo name "Technician"
    const techGroup = await Group.findOne({
      where: {
        name: { [Op.like]: "%Technician%" }, // group name bạn đang có
      },
      attributes: ["id", "name"],
    });

    // 2) fallback cứng groupId=6 (theo DB bạn chụp)
    const technicianGroupId = techGroup?.id || 6;

    const users = await User.findAll({
      where: { groupId: technicianGroupId },
      attributes: ["id", "username", "email", "groupId"],
      order: [["id", "ASC"]],
    });

    return { data: users };
  }

  /* ======================================================
   * MODULE 3: FRANCHISE APPROVAL
   * ====================================================== */

  async getFranchiseRequests(req) {
  const { page, limit, offset } = parsePaging(req.query);
  const { status, q, contractStatus } = req.query;

  const where = {};
  if (status) where.status = status;
  if (contractStatus) where.contractStatus = contractStatus;

  if (q) {
    where[Op.or] = [
      { businessName: { [Op.like]: `%${q}%` } },
      { location: { [Op.like]: `%${q}%` } },
      { contactPerson: { [Op.like]: `%${q}%` } },
      { contactPhone: { [Op.like]: `%${q}%` } },
      { contactEmail: { [Op.like]: `%${q}%` } },
      { contractUrl: { [Op.like]: `%${q}%` } },
    ];
  }

  const { rows, count } = await FranchiseRequest.findAndCountAll({
    where,
    include: [
      {
        model: User,
        as: "requester",
        required: false,
        attributes: ["id", "username", "email"],
      },
      {
        model: User,
        as: "reviewer",
        required: false,
        attributes: ["id", "username", "email"],
      },
      {
        // ✅ show "Gym created" on list
        model: Gym,
        // IMPORTANT: must match the alias defined in FranchiseRequest association
        // FranchiseRequest.belongsTo(Gym, { as: "gym" })
        as: "gym",
        required: false,
        attributes: ["id", "name", "status", "ownerId"],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return {
    data: rows,
    meta: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) },
  };
}


  async getFranchiseRequestDetail(req) {
  const id = Number(req.params.id);
  ensure(id, "Invalid franchise request id");

  const fr = await FranchiseRequest.findByPk(id, {
    include: [
      {
        model: User,
        as: "requester",
        required: false,
        attributes: ["id", "username", "email", "phone"],
      },
      {
        model: User,
        as: "reviewer",
        required: false,
        attributes: ["id", "username", "email"],
      },
      {
        model: Gym,
        // IMPORTANT: must match the alias defined in FranchiseRequest association
        as: "gym",
        required: false,
        attributes: ["id", "name", "address", "status", "ownerId"],
      },
    ],
  });

  ensure(fr, "FranchiseRequest not found", 404);
  return fr;
}


async approveFranchiseRequest(req) {
  /**
   * ✅ Enterprise rule:
   * - Approve KHÔNG tạo gym
   * - Chỉ set approvedAt + reviewedBy + reviewNotes
   * - Chuẩn bị contractStatus = not_sent (nếu chưa có)
   */
  const id = Number(req.params.id);
  const actorId = getActorId(req);
  ensure(actorId, "Missing actor (req.user)", 401);

  const { reviewNotes } = req.body || {};

  return sequelize.transaction(async (t) => {
    const fr = await FranchiseRequest.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    ensure(fr, "FranchiseRequest not found", 404);
    ensure(fr.status === "pending", "Only pending franchise request can be approved");

    const oldValues = safeJson(fr);

    await fr.update(
      {
        status: "approved",
        reviewedBy: actorId,
        reviewNotes: reviewNotes ?? fr.reviewNotes ?? null,
        approvedAt: new Date(),

        // reset reject fields
        rejectedAt: null,
        rejectionReason: null,

        // contract defaults
        contractStatus: fr.contractStatus || "not_sent",
        signProvider: fr.signProvider || "signnow", // default enterprise
      },
      { transaction: t }
    );

    await createAudit({
      t,
      req,
      action: "FRANCHISE_APPROVED",
      tableName: "franchiserequest",
      recordId: fr.id,
      oldValues,
      newValues: safeJson(fr),
    });

    await notifyUser({
      t,
      userId: fr.requesterId,
      title: "Yêu cầu nhượng quyền đã được duyệt",
      message: `Yêu cầu #${fr.id} đã được duyệt. Vui lòng chờ hợp đồng được gửi để ký.`,
      notificationType: "FRANCHISE",
      relatedType: "franchiserequest",
      relatedId: fr.id,
    });

    await sendMessage({
      t,
      senderId: actorId,
      receiverId: fr.requesterId,
      content: `Yêu cầu nhượng quyền #${fr.id} đã được duyệt. Bước tiếp theo: ký hợp đồng nhượng quyền.`,
    });

    return fr;
  });
}


async rejectFranchiseRequest(req) {
  /**
   * ✅ Enterprise rule:
   * - Rejected -> set rejectedAt + rejectionReason
   * - Không tạo gym
   */
  const id = Number(req.params.id);
  const actorId = getActorId(req);
  ensure(actorId, "Missing actor (req.user)", 401);

  const { rejectionReason } = req.body || {};
  ensure(rejectionReason && String(rejectionReason).trim(), "rejectionReason is required");

  return sequelize.transaction(async (t) => {
    const fr = await FranchiseRequest.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    ensure(fr, "FranchiseRequest not found", 404);
    ensure(fr.status === "pending", "Only pending franchise request can be rejected");

    const oldValues = safeJson(fr);

    await fr.update(
      {
        status: "rejected",
        reviewedBy: actorId,
        reviewNotes: rejectionReason,   // để FE cũ vẫn hiển thị được
        rejectionReason,
        rejectedAt: new Date(),
        approvedAt: null,
      },
      { transaction: t }
    );

    await createAudit({
      t,
      req,
      action: "FRANCHISE_REJECTED",
      tableName: "franchiserequest",
      recordId: fr.id,
      oldValues,
      newValues: safeJson(fr),
    });

    await notifyUser({
      t,
      userId: fr.requesterId,
      title: "Yêu cầu nhượng quyền bị từ chối",
      message: `Yêu cầu #${fr.id} bị từ chối. Lý do: ${rejectionReason}`,
      notificationType: "FRANCHISE",
      relatedType: "franchiserequest",
      relatedId: fr.id,
    });

    await sendMessage({
      t,
      senderId: actorId,
      receiverId: fr.requesterId,
      content: `Yêu cầu nhượng quyền #${fr.id} bị từ chối. Lý do: ${rejectionReason}`,
    });

    return fr;
  });
}

  /* ======================================================
   * MODULE 4: POLICIES
   * ====================================================== */

  /**
   * ✅ Nghiệp vụ chuẩn:
   * - appliesTo=system => gymId MUST be null
   * - appliesTo=gym    => gymId MUST exist
   * - value MUST be JSON object (không lưu string JSON bậy)
   * - Khi CREATE/UPDATE/TOGGLE sang ACTIVE:
   *   => tự động INACTIVE các policy ACTIVE khác cùng (policyType + appliesTo + gymId)
   * - Effective policy (áp dụng thực tế):
   *   ưu tiên Gym policy ACTIVE (đúng ngày hiệu lực) -> fallback System policy ACTIVE
   */

  _normalizePolicyInput(body = {}) {
    const allowedTypes = new Set([
      "trainer_share",
      "commission",
      "cancellation",
      "refund",
      "membership",
    ]);
    const allowedApplies = new Set(["system", "gym", "trainer"]);

    const policyType = body.policyType;
    const appliesTo = body.appliesTo;

    ensure(policyType && allowedTypes.has(policyType), "Invalid policyType");
    ensure(appliesTo && allowedApplies.has(appliesTo), "Invalid appliesTo");
    ensure(body.name && String(body.name).trim(), "name is required");

    // gymId rule
    let gymId = body.gymId;
    if (appliesTo === "system") {
      gymId = null;
    } else if (appliesTo === "gym") {
      ensure(
        gymId !== undefined && gymId !== null && String(gymId).trim() !== "",
        "appliesTo=gym thì gymId bắt buộc"
      );
      gymId = Number(gymId);
      ensure(Number.isInteger(gymId) && gymId > 0, "gymId phải là số nguyên dương");
    } else {
      // trainer scope: gymId optional (tuỳ bạn dùng)
      gymId =
        gymId === "" || gymId === undefined || gymId === null ? null : Number(gymId);
      if (gymId !== null) {
        ensure(Number.isInteger(gymId) && gymId > 0, "gymId phải là số nguyên dương");
      }
    }

    // value rule
    let value = body.value;
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch (e) {
        ensure(false, "value phải là JSON hợp lệ (object)");
      }
    }
    ensure(
      value !== undefined &&
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value),
      "value phải là JSON object"
    );

    // dates
    const effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : null;
    const effectiveTo = body.effectiveTo ? new Date(body.effectiveTo) : null;
    if (effectiveFrom && Number.isNaN(effectiveFrom.getTime()))
      ensure(false, "effectiveFrom không hợp lệ");
    if (effectiveTo && Number.isNaN(effectiveTo.getTime()))
      ensure(false, "effectiveTo không hợp lệ");
    if (effectiveFrom && effectiveTo)
      ensure(effectiveFrom.getTime() <= effectiveTo.getTime(), "effectiveFrom phải <= effectiveTo");

    return {
      policyType,
      name: String(body.name).trim(),
      description: body.description ?? null,
      value,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
      appliesTo,
      gymId,
      effectiveFrom,
      effectiveTo,
    };
  }

  async _deactivateOtherPolicies({ t, policyType, appliesTo, gymId, exceptId }) {
    const where = {
      policyType,
      appliesTo,
      gymId: gymId ?? null,
      isActive: true,
    };
    if (exceptId) where.id = { [Op.ne]: exceptId };

    await Policy.update({ isActive: false }, { where, transaction: t });
  }

  _buildEffectiveDateWhere(now = new Date()) {
    return {
      [Op.and]: [
        {
          [Op.or]: [{ effectiveFrom: null }, { effectiveFrom: { [Op.lte]: now } }],
        },
        {
          [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: now } }],
        },
      ],
    };
  }

  async getPolicies(req) {
    const { policyType, gymId, isActive } = req.query;

    const where = {};
    if (policyType) where.policyType = policyType;

    // gymId filter: cho phép "null"/"" để lấy system
    if (gymId !== undefined && gymId !== "") {
      if (String(gymId).toLowerCase() === "null") where.gymId = null;
      else where.gymId = Number(gymId);
    }

    if (isActive !== undefined && isActive !== "") {
      where.isActive = String(isActive) === "true";
    }

    const rows = await Policy.findAll({
      where,
      include: [{ model: Gym, as: "gym", required: false, attributes: ["id", "name"] }],
      order: [["createdAt", "DESC"]],
    });

    return { data: rows };
  }

  // ✅ API dùng cho module khác: ưu tiên gym policy -> fallback system policy
  async getEffectivePolicy(req) {
    const { policyType, gymId } = req.query;
    ensure(policyType, "policyType is required");
    ensure(gymId, "gymId is required");

    const now = new Date();
    const dateWhere = this._buildEffectiveDateWhere(now);

    const gymPolicy = await Policy.findOne({
      where: {
        policyType,
        appliesTo: "gym",
        gymId: Number(gymId),
        isActive: true,
        ...dateWhere,
      },
      order: [
        ["effectiveFrom", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    if (gymPolicy) return { data: gymPolicy };

    const systemPolicy = await Policy.findOne({
      where: {
        policyType,
        appliesTo: "system",
        gymId: null,
        isActive: true,
        ...dateWhere,
      },
      order: [
        ["effectiveFrom", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    return { data: systemPolicy || null };
  }

  async createPolicy(req) {
    const actorId = getActorId(req);
    ensure(actorId, "Missing actor (req.user)", 401);

    const payload = this._normalizePolicyInput(req.body || {});

    return sequelize.transaction(async (t) => {
      if (payload.isActive) {
        await this._deactivateOtherPolicies({
          t,
          policyType: payload.policyType,
          appliesTo: payload.appliesTo,
          gymId: payload.gymId,
          exceptId: null,
        });
      }

      const p = await Policy.create(payload, { transaction: t });

      await createAudit({
        t,
        req,
        action: "POLICY_CREATED",
        tableName: "policy",
        recordId: p.id,
        oldValues: null,
        newValues: safeJson(p),
      });

      return p;
    });
  }

  async updatePolicy(req) {
    const id = Number(req.params.id);
    const actorId = getActorId(req);
    ensure(actorId, "Missing actor (req.user)", 401);

    return sequelize.transaction(async (t) => {
      const p = await Policy.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      ensure(p, "Policy not found", 404);

      const oldValues = safeJson(p);

      // merge data cũ + data mới để validate đầy đủ
      const merged = { ...safeJson(p), ...req.body };
      const payload = this._normalizePolicyInput(merged);

      if (payload.isActive) {
        await this._deactivateOtherPolicies({
          t,
          policyType: payload.policyType,
          appliesTo: payload.appliesTo,
          gymId: payload.gymId,
          exceptId: p.id,
        });
      }

      await p.update(payload, { transaction: t });

      await createAudit({
        t,
        req,
        action: "POLICY_UPDATED",
        tableName: "policy",
        recordId: p.id,
        oldValues,
        newValues: safeJson(p),
      });

      return p;
    });
  }

  async togglePolicy(req) {
    const id = Number(req.params.id);
    const actorId = getActorId(req);
    ensure(actorId, "Missing actor (req.user)", 401);

    return sequelize.transaction(async (t) => {
      const p = await Policy.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      ensure(p, "Policy not found", 404);

      const oldValues = safeJson(p);

      const nextActive = !p.isActive;

      if (nextActive) {
        await this._deactivateOtherPolicies({
          t,
          policyType: p.policyType,
          appliesTo: p.appliesTo,
          gymId: p.gymId,
          exceptId: p.id,
        });
      }

      await p.update({ isActive: nextActive }, { transaction: t });

      await createAudit({
        t,
        req,
        action: "POLICY_TOGGLED",
        tableName: "policy",
        recordId: p.id,
        oldValues,
        newValues: safeJson(p),
      });

      return p;
    });
  }

  /* ======================================================
   * MODULE 5 + MODULE 6: giữ nguyên như bạn đang có
   * (nếu bạn muốn mình cũng có thể paste nốt, nhưng hiện bạn đang crash ở technicians)
   * ====================================================== */

  async getTrainerShares(req) {
    const { page, limit, offset } = parsePaging(req.query);
    const { status, fromGymId, toGymId, trainerId } = req.query;

    const where = {};
    if (status) where.status = status;
    if (fromGymId) where.fromGymId = Number(fromGymId);
    if (toGymId) where.toGymId = Number(toGymId);
    if (trainerId) where.trainerId = Number(trainerId);

    const { rows, count } = await TrainerShare.findAndCountAll({
      where,
      include: [
        { model: Trainer, required: false, include: [{ model: User, required: false }] },
        { model: Gym, as: "fromGym", required: false },
        { model: Gym, as: "toGym", required: false },
        { model: User, as: "requester", required: false },
        { model: User, as: "approver", required: false },
        { model: Policy, required: false },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return {
      data: rows,
      meta: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) },
    };
  }

  async getTrainerShareDetail(req) {
    const id = Number(req.params.id);
    ensure(id, "Invalid trainer share id");

    const ts = await TrainerShare.findByPk(id, {
      include: [
        { model: Trainer, required: false, include: [{ model: User, required: false }] },
        { model: Gym, as: "fromGym", required: false },
        { model: Gym, as: "toGym", required: false },
        { model: User, as: "requester", required: false },
        { model: User, as: "approver", required: false },
        { model: Policy, required: false },
      ],
    });
    ensure(ts, "TrainerShare not found", 404);
    return ts;
  }

  async approveTrainerShare(req) {
    const id = Number(req.params.id);
    const actorId = getActorId(req);
    ensure(actorId, "Missing actor (req.user)", 401);

    const { policyId, commissionSplit } = req.body || {};
    ensure(policyId, "policyId is required");
    ensure(commissionSplit !== undefined && commissionSplit !== null, "commissionSplit is required");

    return sequelize.transaction(async (t) => {
      const ts = await TrainerShare.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      ensure(ts, "TrainerShare not found", 404);
      ensure(ts.status === "pending", "Only pending trainer share can be approved");

      const oldValues = safeJson(ts);

      await ts.update(
        {
          status: "approved",
          approvedBy: actorId,
          policyId: Number(policyId),
          commissionSplit: Number(commissionSplit),
        },
        { transaction: t }
      );

      await createAudit({
        t,
        req,
        action: "TRAINERSHARE_APPROVED",
        tableName: "trainershare",
        recordId: ts.id,
        oldValues,
        newValues: safeJson(ts),
      });

      await notifyUser({
        t,
        userId: ts.requestedBy,
        title: "Yêu cầu chia sẻ PT đã được duyệt",
        message: `Yêu cầu chia sẻ PT #${ts.id} đã được duyệt.`,
        notificationType: "TRAINER_SHARE",
        relatedType: "trainershare",
        relatedId: ts.id,
      });

      const trainer = await Trainer.findByPk(ts.trainerId, { transaction: t });
      if (trainer?.userId) {
        await notifyUser({
          t,
          userId: trainer.userId,
          title: "Bạn đã được chia sẻ sang gym khác",
          message: `Bạn được chia sẻ (approved) theo yêu cầu #${ts.id}.`,
          notificationType: "TRAINER_SHARE",
          relatedType: "trainershare",
          relatedId: ts.id,
        });
      }

      return ts;
    });
  }

  async rejectTrainerShare(req) {
    const id = Number(req.params.id);
    const actorId = getActorId(req);
    ensure(actorId, "Missing actor (req.user)", 401);

    const { reason } = req.body || {};
    ensure(reason && String(reason).trim(), "reason is required");

    return sequelize.transaction(async (t) => {
      const ts = await TrainerShare.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      ensure(ts, "TrainerShare not found", 404);
      ensure(ts.status === "pending", "Only pending trainer share can be rejected");

      const oldValues = safeJson(ts);

      await ts.update(
        {
          status: "rejected",
          approvedBy: actorId,
          notes: ts.notes ? `${ts.notes}\n[REJECT_REASON]: ${reason}` : `[REJECT_REASON]: ${reason}`,
        },
        { transaction: t }
      );

      await createAudit({
        t,
        req,
        action: "TRAINERSHARE_REJECTED",
        tableName: "trainershare",
        recordId: ts.id,
        oldValues,
        newValues: safeJson(ts),
      });

      await notifyUser({
        t,
        userId: ts.requestedBy,
        title: "Yêu cầu chia sẻ PT bị từ chối",
        message: `Yêu cầu #${ts.id} bị từ chối. Lý do: ${reason}`,
        notificationType: "TRAINER_SHARE",
        relatedType: "trainershare",
        relatedId: ts.id,
      });

      return ts;
    });
  }

  async overrideTrainerShare(req) {
    const id = Number(req.params.id);
    const actorId = getActorId(req);
    ensure(actorId, "Missing actor (req.user)", 401);

    const { policyId, commissionSplit, notes } = req.body || {};
    ensure(policyId || commissionSplit !== undefined, "policyId or commissionSplit is required");

    return sequelize.transaction(async (t) => {
      const ts = await TrainerShare.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      ensure(ts, "TrainerShare not found", 404);
      ensure(ts.status === "approved", "Only approved trainer share can be overridden");

      const oldValues = safeJson(ts);

      await ts.update(
        {
          policyId: policyId ? Number(policyId) : ts.policyId,
          commissionSplit:
            commissionSplit !== undefined && commissionSplit !== null
              ? Number(commissionSplit)
              : ts.commissionSplit,
          notes: notes ?? ts.notes,
        },
        { transaction: t }
      );

      await createAudit({
        t,
        req,
        action: "TRAINERSHARE_OVERRIDDEN",
        tableName: "trainershare",
        recordId: ts.id,
        oldValues,
        newValues: safeJson(ts),
      });

      await notifyUser({
        t,
        userId: ts.requestedBy,
        title: "Ngoại lệ chia sẻ PT đã được cập nhật",
        message: `Yêu cầu chia sẻ PT #${ts.id} đã được override bởi admin.`,
        notificationType: "TRAINER_SHARE",
        relatedType: "trainershare",
        relatedId: ts.id,
      });

      return ts;
    });
  }

  async getAuditLogs(req) {
    const { page, limit, offset } = parsePaging(req.query);
    const { q, action, entityType, tableName, from, to } = req.query;

    const where = {};
    if (action) where.action = action;

    const tname = tableName || entityType;
    if (tname) where.tableName = tname;

    if (q) {
      where[Op.or] = [{ action: { [Op.like]: `%${q}%` } }, { tableName: { [Op.like]: `%${q}%` } }];
    }

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = toISODateStart(from);
      if (to) where.createdAt[Op.lte] = toISODateEnd(to);
    }

    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: User, required: false }],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return {
      data: rows,
      meta: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) },
    };
  }

  async getReportSummary(req) {
    const { from, to, gymId } = req.query;

    const whereTx = {};
    const whereBooking = {};
    const whereMaintenance = {};
    const whereReceipt = {};
    const wherePO = {};

    if (gymId) {
      const gid = Number(gymId);
      whereTx.gymId = gid;
      whereBooking.gymId = gid;
      whereMaintenance.gymId = gid;
      whereReceipt.gymId = gid;
      wherePO.gymId = gid;
    }

    if (from || to) {
      const range = {};
      if (from) range[Op.gte] = toISODateStart(from);
      if (to) range[Op.lte] = toISODateEnd(to);

      whereTx.transactionDate = range;
      whereReceipt.receiptDate = range;
      wherePO.orderDate = range;
    }

    const [
      revenueSum,
      bookingCount,
      maintenancePending,
      maintenanceInProgress,
      franchisePending,
      inboundReceiptCount,
      poPendingCount,
      trainerSharePendingCount,
    ] = await Promise.all([
      Transaction.sum("amount", { where: whereTx }).then((v) => Number(v || 0)),
      Booking.count({ where: whereBooking }).catch(() => 0),
      Maintenance.count({ where: { ...whereMaintenance, status: "pending" } }).catch(() => 0),
      Maintenance.count({ where: { ...whereMaintenance, status: "in_progress" } }).catch(() => 0),
      FranchiseRequest.count({ where: { status: "pending" } }).catch(() => 0),
      Receipt.count({ where: { ...whereReceipt, type: "inbound" } }).catch(() => 0),
      PurchaseOrder.count({ where: { ...wherePO, status: "pending" } }).catch(() => 0),
      TrainerShare.count({ where: { status: "pending" } }).catch(() => 0),
    ]);

    return {
      from: from || null,
      to: to || null,
      gymId: gymId ? Number(gymId) : null,
      cards: {
        revenueSum,
        bookingCount,
        maintenancePending,
        maintenanceInProgress,
        franchisePending,
        inboundReceiptCount,
        poPendingCount,
        trainerSharePendingCount,
      },
    };
  }

  // ========== DASHBOARD OVERVIEW (combo-focused admin) ==========
  async getDashboardOverview(req) {
    const days = Math.min(90, Math.max(7, Number(req.query?.days || 30)));
    const nowDt = new Date();
    const fromDt = new Date(nowDt.getTime() - days * 24 * 60 * 60 * 1000);

    const gymId = req.query?.gymId ? Number(req.query.gymId) : null;

    const comboRequestWhere = { comboId: { [Op.ne]: null } };
    if (gymId) comboRequestWhere.gymId = gymId;

    const completedComboTxWhere = {
      transactionType: "equipment_purchase",
      paymentStatus: "completed",
      transactionDate: { [Op.gte]: fromDt, [Op.lte]: nowDt },
    };
    if (gymId) completedComboTxWhere.gymId = gymId;

    const [
      franchisePending,
      maintenancePending,
      comboPending,
      latestComboRequests,
      comboTransactions,
    ] = await Promise.all([
      FranchiseRequest.count({ where: { status: "pending" } }).catch(() => 0),
      Maintenance.count({ where: { ...(gymId ? { gymId } : {}), status: "pending" } }).catch(() => 0),
      PurchaseRequest.count({ where: { ...comboRequestWhere, status: "submitted" } }).catch(() => 0),
      PurchaseRequest.findAll({
        where: comboRequestWhere,
        order: [["createdAt", "DESC"], ["id", "DESC"]],
        limit: 6,
        include: [
          { model: Gym, as: "gym", attributes: ["id", "name"], required: false },
          { model: EquipmentCombo, as: "combo", attributes: ["id", "name", "code", "price", "coverImage"], required: false },
        ],
      }).catch(() => []),
      Transaction.findAll({
        where: completedComboTxWhere,
        order: [["transactionDate", "DESC"], ["id", "DESC"]],
        include: [
          { model: Gym, attributes: ["id", "name"], required: false },
          { model: PurchaseRequest, as: "purchaseRequest", attributes: ["id", "code", "status", "comboId"], required: true, where: { comboId: { [Op.ne]: null } }, include: [{ model: EquipmentCombo, as: "combo", attributes: ["id", "name", "code"], required: false }] },
        ],
      }).catch(() => []),
    ]);

    const comboRevenue30d = (comboTransactions || []).reduce((sum, tx) => sum + Number(tx?.amount || 0), 0);

    const dayMap = new Map();
    for (const tx of comboTransactions || []) {
      const rawDate = tx?.transactionDate || tx?.createdAt;
      if (!rawDate) continue;
      const key = new Date(rawDate).toISOString().slice(0, 10);
      dayMap.set(key, Number(dayMap.get(key) || 0) + Number(tx?.amount || 0));
    }

    const revenue30dSeries = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(nowDt.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      revenue30dSeries.push({ date: key, total: Number(dayMap.get(key) || 0) });
    }

    const latestComboRequestRows = (latestComboRequests || []).map((row) => {
      const json = row.toJSON ? row.toJSON() : row;
      return {
        id: json.id,
        code: json.code,
        status: json.status,
        totalAmount: Number(json.totalAmount || json.combo?.price || 0),
        createdAt: json.createdAt,
        gym: json.gym ? { id: json.gym.id, name: json.gym.name } : null,
        combo: json.combo ? { id: json.combo.id, name: json.combo.name, code: json.combo.code, price: Number(json.combo.price || 0), coverImage: json.combo.coverImage || null } : null,
      };
    });

    const comboSalesTransactions = (comboTransactions || []).slice(0, 15).map((tx) => ({
      id: tx.id,
      transactionCode: tx.transactionCode,
      amount: Number(tx.amount || 0),
      paymentMethod: tx.paymentMethod,
      paymentStatus: tx.paymentStatus,
      description: tx.description,
      transactionDate: tx.transactionDate,
      gym: tx.Gym ? { id: tx.Gym.id, name: tx.Gym.name } : null,
      purchaseRequest: tx.purchaseRequest
        ? {
            id: tx.purchaseRequest.id,
            code: tx.purchaseRequest.code,
            status: tx.purchaseRequest.status,
            combo: tx.purchaseRequest.combo
              ? {
                  id: tx.purchaseRequest.combo.id,
                  name: tx.purchaseRequest.combo.name,
                  code: tx.purchaseRequest.combo.code,
                }
              : null,
          }
        : null,
      metadata: tx.metadata || null,
    }));

    return {
      asOf: nowDt.toISOString(),
      days,
      gymId,
      cards: {
        franchisePending,
        maintenancePending,
        comboPending,
        comboRevenue30d,
      },
      latestComboRequests: latestComboRequestRows,
      revenue30dSeries,
      comboSalesTransactions,
    };
  }

  // ========== REPORTS (6.2) ==========
  async getReportRevenue(req) {
    const { from, to, gymId } = req.query;

    const where = {
      paymentStatus: "completed",
    };

    if (gymId) where.gymId = Number(gymId);

    if (from || to) {
      where.transactionDate = {};
      if (from) where.transactionDate[Op.gte] = toISODateStart(from);
      if (to) where.transactionDate[Op.lte] = toISODateEnd(to);
    }

    const total = await Transaction.sum("amount", { where }).then((v) => Number(v || 0));

    const byTypeRows = await Transaction.findAll({
      where,
      attributes: ["transactionType", [sequelize.fn("SUM", sequelize.col("amount")), "total"]],
      group: ["transactionType"],
      raw: true,
    }).catch(() => []);

    const byMethodRows = await Transaction.findAll({
      where,
      attributes: ["paymentMethod", [sequelize.fn("SUM", sequelize.col("amount")), "total"]],
      group: ["paymentMethod"],
      raw: true,
    }).catch(() => []);

    // daily series (DB dependent fn DATE)
    const dailyRows = await Transaction.findAll({
      where,
      attributes: [[sequelize.fn("DATE", sequelize.col("transactionDate")), "date"], [sequelize.fn("SUM", sequelize.col("amount")), "total"]],
      group: [sequelize.fn("DATE", sequelize.col("transactionDate"))],
      order: [[sequelize.fn("DATE", sequelize.col("transactionDate")), "ASC"]],
      raw: true,
    }).catch(() => []);

    const latest = await Transaction.findAll({
      where,
      order: [["transactionDate", "DESC"]],
      limit: 50,
      raw: true,
    }).catch(() => []);

    return {
      from: from || null,
      to: to || null,
      gymId: gymId ? Number(gymId) : null,
      total,
      byType: byTypeRows.map((r) => ({ type: r.transactionType || "unknown", total: Number(r.total || 0) })),
      byPaymentMethod: byMethodRows.map((r) => ({ method: r.paymentMethod || "unknown", total: Number(r.total || 0) })),
      daily: dailyRows.map((r) => ({ date: r.date, total: Number(r.total || 0) })),
      latest,
    };
  }

  async getReportInventory(req) {
    const { from, to, gymId } = req.query;

    const gid = gymId ? Number(gymId) : null;

    const wherePO = {};
    const whereReceipt = {};
    const whereStock = {};
    const whereInv = {};

    if (gid) {
      wherePO.gymId = gid;
      whereReceipt.gymId = gid;
      whereStock.gymId = gid;
      whereInv.gymId = gid;
    }

    if (from || to) {
      const range = {};
      if (from) range[Op.gte] = toISODateStart(from);
      if (to) range[Op.lte] = toISODateEnd(to);
      wherePO.orderDate = range;
      whereReceipt.receiptDate = range;
      whereInv.createdAt = range;
    }

    const [
      poPending,
      poTotal,
      inboundCount,
      outboundCount,
      inboundValue,
      lowStockCount,
      latestInventory,
    ] = await Promise.all([
      PurchaseOrder.count({ where: { ...wherePO, status: "pending" } }).catch(() => 0),
      PurchaseOrder.sum("totalAmount", { where: wherePO }).then((v) => Number(v || 0)).catch(() => 0),
      Receipt.count({ where: { ...whereReceipt, type: "inbound" } }).catch(() => 0),
      Receipt.count({ where: { ...whereReceipt, type: "outbound" } }).catch(() => 0),
      Receipt.sum("totalValue", { where: { ...whereReceipt, type: "inbound" } }).then((v) => Number(v || 0)).catch(() => 0),
      EquipmentStock.count({ where: { ...whereStock, availableQuantity: { [Op.lte]: 10 } } }).catch(() => 0),
      Inventory.findAll({ where: whereInv, order: [["createdAt", "DESC"]], limit: 60, raw: true }).catch(() => []),
    ]);

    return {
      from: from || null,
      to: to || null,
      gymId: gid,
      cards: {
        poPending,
        poTotal,
        inboundCount,
        outboundCount,
        inboundValue,
        lowStockCount,
      },
      latestInventory,
    };
  }

  async getReportTrainerShare(req) {
    const { from, to, gymId } = req.query;

    const where = {};

    // note: TrainerShare has fromGymId/toGymId, not gymId
    if (gymId) {
      const gid = Number(gymId);
      where[Op.or] = [{ fromGymId: gid }, { toGymId: gid }];
    }

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = toISODateStart(from);
      if (to) where.createdAt[Op.lte] = toISODateEnd(to);
    }

    const rows = await TrainerShare.findAll({ where, order: [["createdAt", "DESC"]], limit: 200, raw: true }).catch(() => []);

    const statusCounts = rows.reduce((acc, r) => {
      const st = String(r.status || "unknown").toLowerCase();
      acc[st] = (acc[st] || 0) + 1;
      return acc;
    }, {})

    return {
      from: from || null,
      to: to || null,
      gymId: gymId ? Number(gymId) : null,
      statusCounts,
      latest: rows.slice(0, 50),
    };
  }

}

module.exports = new AdminAdminCoreService();
