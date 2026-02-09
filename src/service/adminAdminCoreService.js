"use strict";

const { Op } = require("sequelize");
const {
  sequelize,

  // Core
  User,
  Gym,

  // RBAC
  Group,

  // Module 2
  Maintenance,
  Equipment,
  EquipmentStock,

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
} = require("../models");

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
  return Notification.create(
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

      await sendMessage({
        t,
        senderId: actorId,
        receiverId: m.requestedBy,
        content: `Yêu cầu bảo trì #${m.id} đã được duyệt. Lịch: ${new Date(
          scheduledDate
        ).toLocaleString()}.`,
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

      await createAudit({
        t,
        req,
        action: "MAINTENANCE_REJECTED",
        tableName: "maintenance",
        recordId: m.id,
        oldValues,
        newValues: safeJson(m),
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
      ensure(m.status === "assigned", "Only assigned maintenance can be started");

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

      await notifyUser({
        t,
        userId: m.requestedBy,
        title: "Bảo trì đã bắt đầu",
        message: `Bảo trì #${m.id} đã bắt đầu xử lý.`,
        notificationType: "MAINTENANCE",
        relatedType: "maintenance",
        relatedId: m.id,
      });

      return m;
    });
  }

  async completeMaintenance(req) {
    const id = Number(req.params.id);
    const actorId = getActorId(req);
    ensure(actorId, "Missing actor (req.user)", 401);

    const { actualCost, completionDate } = req.body || {};
    ensure(actualCost !== undefined && actualCost !== null, "actualCost is required");

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
          actualCost,
          completionDate: completionDate ? new Date(completionDate) : new Date(),
        },
        { transaction: t }
      );

      const tx = await Transaction.create(
        {
          transactionCode: `MAINT-${m.id}-${Date.now()}`,
          gymId: m.gymId,
          amount: actualCost,
          transactionType: "maintenance",
          paymentMethod: "manual",
          paymentStatus: "completed",
          description: `Maintenance completed for maintenanceId=${m.id}`,
          metadata: { maintenanceId: m.id },
          transactionDate: new Date(),
          processedBy: actorId,
        },
        { transaction: t }
      );

      await createAudit({
        t,
        req,
        action: "MAINTENANCE_COMPLETED",
        tableName: "maintenance",
        recordId: m.id,
        oldValues,
        newValues: { ...safeJson(m), transactionId: tx.id },
      });

      await notifyUser({
        t,
        userId: m.requestedBy,
        title: "Bảo trì đã hoàn tất",
        message: `Bảo trì #${m.id} đã hoàn tất. Chi phí thực tế: ${actualCost}.`,
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

      return { maintenance: m, transaction: tx };
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
  const { status, q } = req.query;

  const where = {};
  if (status) where.status = status;

  if (q) {
    where[Op.or] = [
      { businessName: { [Op.like]: `%${q}%` } },
      { location: { [Op.like]: `%${q}%` } },
      { contactPerson: { [Op.like]: `%${q}%` } },
      { contactPhone: { [Op.like]: `%${q}%` } },
      { contactEmail: { [Op.like]: `%${q}%` } },
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
        as: "createdGym",
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
        as: "createdGym",
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
}

module.exports = new AdminAdminCoreService();
