import bcrypt from "bcryptjs";
import { Op } from "sequelize";
import db from "../models/index.js";

const SALT_ROUNDS = 10;

const pickSort = (sortBy, sortOrder) => {
  const allowed = new Set(["id", "email", "username", "phone", "status", "createdAt"]);
  const field = allowed.has(sortBy) ? sortBy : "createdAt";
  const order = (String(sortOrder).toLowerCase() === "asc") ? "ASC" : "DESC";
  return [[field, order]];
};

const sanitizeUser = (u) => {
  if (!u) return u;
  const obj = u.toJSON ? u.toJSON() : u;
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  return obj;
};

const toStatusFilter = (raw) => {
  const v = String(raw || "active").toLowerCase();
  // default: active (chuẩn admin UX)
  if (v === "all") return null;
  if (["active", "inactive", "suspended"].includes(v)) return v;
  return "active";
};

// ===== AuditLog helper (không cần middleware) =====
const writeAuditLog = async ({
  actorUserId = null,
  action,
  tableName,
  recordId = null,
  oldValues = null,
  newValues = null,
  ipAddress = null,
  userAgent = null
}) => {
  try {
    // nếu project bạn chưa migrate auditlog thì log vẫn không làm crash
    if (!db.AuditLog) return;
    await db.AuditLog.create({
      userId: actorUserId,
      action,
      tableName,
      recordId,
      oldValues,
      newValues,
      ipAddress,
      userAgent
    });
  } catch (e) {
    console.warn("writeAuditLog failed:", e?.message || e);
  }
};

const useApiService = {
  // UC-USER-13: list users (pagination + search + sort + status filter)
  getUsers: async (query) => {
    const page = Math.max(1, parseInt(query.page || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(query.limit || "10", 10)));
    const offset = (page - 1) * limit;

    const search = String(query.search || "").trim();
    const { sortBy, sortOrder } = query;

    const statusFilter = toStatusFilter(query.status);
    const where = {};

    // ✅ status filter (default active)
    if (statusFilter) where.status = statusFilter;

    if (search) {
      where[Op.or] = [
        { email: { [Op.like]: `%${search}%` } },
        { username: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await db.User.findAndCountAll({
      where,
      offset,
      limit,
      order: pickSort(sortBy, sortOrder),
      attributes: { exclude: ["password", "resetPasswordToken", "resetPasswordExpires"] },
      include: [{ model: db.Group, attributes: ["id", "name"], required: false }]
    });

    const data = rows.map(r => {
      const u = sanitizeUser(r);
      return { ...u, groupName: r.Group ? r.Group.name : null };
    });

    const totalPages = Math.max(1, Math.ceil(count / limit));

    return {
      data,
      meta: { page, limit, totalItems: count, totalPages }
    };
  },

  // UC-USER-14: create user
  createUser: async (payload, auditMeta = {}) => {
    const email = String(payload.email || "").trim();
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");

    if (!email) throw new Error("Email is required");
    if (!username) throw new Error("Username is required");
    if (!password) throw new Error("Password is required");

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const created = await db.User.create({
      email,
      username,
      password: hashed,
      phone: payload.phone || null,
      address: payload.address || null,
      sex: payload.sex || "male",
      status: payload.status || "active",
      groupId: payload.groupId ?? null,
      avatar: payload.avatar || "default-avatar.png"
    });

    await writeAuditLog({
      ...auditMeta,
      action: "CREATE_USER",
      tableName: "User",
      recordId: created.id,
      oldValues: null,
      newValues: sanitizeUser(created)
    });

    return sanitizeUser(created);
  },

  // UC-USER-15: update user
  updateUser: async (id, payload, auditMeta = {}) => {
    const user = await db.User.findOne({ where: { id } });
    if (!user) return null;

    const before = sanitizeUser(user);

    const updates = {};
    if (payload.email != null) updates.email = String(payload.email).trim();
    if (payload.username != null) updates.username = String(payload.username).trim();
    if (payload.phone != null) updates.phone = payload.phone ? String(payload.phone).trim() : null;
    if (payload.address != null) updates.address = payload.address ? String(payload.address).trim() : null;
    if (payload.sex != null) updates.sex = payload.sex;
    if (payload.status != null) updates.status = payload.status;
    if (payload.groupId !== undefined) updates.groupId = payload.groupId;

    if (payload.password) {
      updates.password = await bcrypt.hash(String(payload.password), SALT_ROUNDS);
    }

    const updated = await user.update(updates);

    await writeAuditLog({
      ...auditMeta,
      action: "UPDATE_USER",
      tableName: "User",
      recordId: updated.id,
      oldValues: before,
      newValues: sanitizeUser(updated)
    });

    return sanitizeUser(updated);
  },

  // UC-USER-16: SOFT DELETE (disable user)
  deleteUser: async (id, auditMeta = {}) => {
    const user = await db.User.findOne({ where: { id } });
    if (!user) throw new Error("User not found");

    // nếu đã inactive thì coi như OK
    if (user.status === "inactive") return true;

    const before = sanitizeUser(user);

    await user.update({ status: "inactive" });

    await writeAuditLog({
      ...auditMeta,
      action: "DISABLE_USER",
      tableName: "User",
      recordId: user.id,
      oldValues: before,
      newValues: sanitizeUser(user)
    });

    return true;
  },

  // for FE dropdown
  getGroups: async () => {
    const rows = await db.Group.findAll({
      attributes: ["id", "name", "description"],
      order: [["id", "ASC"]],
      raw: true
    });
    return { data: rows };
  }
};

module.exports = useApiService;
