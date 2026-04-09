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

/** Chuẩn hoá lỗi Sequelize → thông báo tiếng Việt, kèm gợi ý format */
const formatSequelizeUserError = (e) => {
  if (!e) return "Không thể lưu người dùng.";
  if (e.name === "SequelizeUniqueConstraintError") {
    const paths = (e.errors || []).map((x) => x.path).filter(Boolean);
    if (paths.includes("email")) return "Email này đã được đăng ký. Vui lòng dùng email khác.";
    if (paths.includes("username")) return "Tên đăng nhập đã tồn tại. Chọn tên khác (3–32 ký tự, chữ/số/_).";
    return "Dữ liệu trùng lặp (email hoặc tên đăng nhập đã có trong hệ thống).";
  }
  if (e.name === "SequelizeValidationError") {
    const parts = (e.errors || []).map((err) => {
      const path = err.path || "field";
      if (path === "email") {
        return "Email: cần đúng định dạng (vd: ten@gmail.com).";
      }
      if (path === "phone") {
        return "Số điện thoại: nếu nhập thì chỉ 10–11 chữ số, không khoảng trắng (vd: 0912345678).";
      }
      if (path === "sex") {
        return "Giới tính: chọn Nam / Nữ / Khác.";
      }
      return `${path}: ${err.message || "không hợp lệ"}`;
    });
    return `Dữ liệu chưa đạt yêu cầu:\n• ${parts.join("\n• ")}`;
  }
  return e.message || "Không thể lưu người dùng.";
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;
const PHONE_RE = /^[0-9]{10,11}$/;

const validateUserPayload = (payload, { requirePassword, requireGroup } = {}) => {
  const email = String(payload.email || "").trim();
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "");
  const phoneRaw = payload.phone != null ? String(payload.phone).trim() : "";
  const sex = payload.sex != null ? String(payload.sex) : "male";

  if (!email) throw new Error("Email là bắt buộc.\nĐịnh dạng: ten@gmail.com (có @ và tên miền).");
  if (!EMAIL_RE.test(email)) {
    throw new Error("Email không đúng định dạng.\nVí dụ hợp lệ: user.name@gmail.com");
  }
  if (!username) throw new Error("Tên đăng nhập là bắt buộc.\nQuy tắc: 3–32 ký tự, chỉ chữ không dấu, số và dấu gạch dưới _.");
  if (!USERNAME_RE.test(username)) {
    throw new Error(
      "Tên đăng nhập không hợp lệ.\nCần: 3–32 ký tự, chỉ a-z, A-Z, 0-9 và _. Không dùng khoảng trắng hoặc ký tự đặc biệt."
    );
  }
  if (requirePassword) {
    if (!password) throw new Error("Mật khẩu là bắt buộc khi tạo mới.\nNên tối thiểu 6 ký tự.");
    if (password.length < 6) throw new Error("Mật khẩu quá ngắn.\nYêu cầu: tối thiểu 6 ký tự.");
  } else if (password && password.length < 6) {
    throw new Error("Mật khẩu mới quá ngắn.\nYêu cầu: tối thiểu 6 ký tự (hoặc để trống nếu không đổi).");
  }
  if (phoneRaw && !PHONE_RE.test(phoneRaw)) {
    throw new Error(
      "Số điện thoại không hợp lệ.\nNếu nhập: chỉ 10–11 chữ số, không dấu +, không khoảng trắng (vd: 0912345678)."
    );
  }
  if (!["male", "female", "other"].includes(sex)) {
    throw new Error('Giới tính không hợp lệ. Chọn một trong: "male", "female", "other" (Nam/Nữ/Khác).');
  }

  let groupId = payload.groupId;
  if (groupId === "" || groupId === undefined) groupId = null;
  if (requireGroup && (groupId == null || groupId === "")) {
    throw new Error("Vui lòng chọn nhóm (Group) cho tài khoản.\nĐây là nhóm quyền trong hệ thống, không phải danh sách Role riêng lẻ.");
  }
  if (groupId != null) {
    const n = Number(groupId);
    if (!Number.isFinite(n) || n < 1) throw new Error("Nhóm (group) không hợp lệ. Chọn lại từ danh sách.");
    groupId = n;
  }

  return {
    email,
    username,
    password,
    phone: phoneRaw || null,
    sex,
    groupId,
    address: payload.address != null ? String(payload.address).trim() || null : null,
    status: payload.status || "active",
  };
};

const validateUserUpdatePayload = (payload) => {
  const out = {};
  if (payload.email != null) {
    const email = String(payload.email).trim();
    if (!email) throw new Error("Email không được để trống.\nĐịnh dạng: ten@gmail.com.");
    if (!EMAIL_RE.test(email)) throw new Error("Email không đúng định dạng.\nVí dụ: user@gmail.com");
    out.email = email;
  }
  if (payload.username != null) {
    const username = String(payload.username).trim();
    if (!username) throw new Error("Tên đăng nhập không được để trống.");
    if (!USERNAME_RE.test(username)) {
      throw new Error(
        "Tên đăng nhập không hợp lệ.\nCần: 3–32 ký tự, chỉ a-z, A-Z, 0-9 và _."
      );
    }
    out.username = username;
  }
  if (payload.password) {
    const password = String(payload.password);
    if (password.length < 6) throw new Error("Mật khẩu mới quá ngắn.\nYêu cầu: tối thiểu 6 ký tự.");
    out.password = password;
  }
  if (payload.phone !== undefined) {
    const phoneRaw = payload.phone ? String(payload.phone).trim() : "";
    if (phoneRaw && !PHONE_RE.test(phoneRaw)) {
      throw new Error("Số điện thoại không hợp lệ.\nChỉ 10–11 chữ số, không khoảng trắng (vd: 0912345678).");
    }
    out.phone = phoneRaw || null;
  }
  if (payload.address !== undefined) {
    out.address = payload.address ? String(payload.address).trim() : null;
  }
  if (payload.sex != null) {
    const sex = String(payload.sex);
    if (!["male", "female", "other"].includes(sex)) throw new Error("Giới tính không hợp lệ.");
    out.sex = sex;
  }
  if (payload.status != null) out.status = payload.status;
  if (payload.groupId !== undefined) {
    let groupId = payload.groupId;
    if (groupId === "" || groupId === null) {
      out.groupId = null;
    } else {
      const n = Number(groupId);
      if (!Number.isFinite(n) || n < 1) throw new Error("Nhóm không hợp lệ. Chọn lại từ danh sách.");
      out.groupId = n;
    }
  }
  return out;
};

async function assertGroupExists(groupId) {
  if (groupId == null) return;
  const g = await db.Group.findByPk(groupId);
  if (!g) {
    throw new Error(
      "Nhóm bạn chọn không tồn tại trong hệ thống.\nHãy tải lại trang (danh sách nhóm có thể đã cập nhật)."
    );
  }
}

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
    const v = validateUserPayload(payload, { requirePassword: true, requireGroup: true });
    await assertGroupExists(v.groupId);

    const hashed = await bcrypt.hash(v.password, SALT_ROUNDS);

    let created;
    try {
      created = await db.User.create({
        email: v.email,
        username: v.username,
        password: hashed,
        phone: v.phone,
        address: v.address,
        sex: v.sex,
        status: v.status,
        groupId: v.groupId,
        avatar: payload.avatar || "default-avatar.png"
      });
    } catch (e) {
      throw new Error(formatSequelizeUserError(e));
    }

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

    const patch = validateUserUpdatePayload(payload);
    if (patch.groupId !== undefined) await assertGroupExists(patch.groupId);

    const updates = { ...patch };
    if (updates.password) {
      updates.password = await bcrypt.hash(String(updates.password), SALT_ROUNDS);
    }

    let updated;
    try {
      updated = await user.update(updates);
    } catch (e) {
      throw new Error(formatSequelizeUserError(e));
    }

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
    // DB có thể bị seed/migrate lặp nhiều dòng cùng tên nhóm → dropdown trùng; gộp theo tên (giữ id nhỏ nhất).
    const byNameKey = new Map();
    for (const r of rows) {
      const key = String(r.name || "").trim().toLowerCase() || `__id_${r.id}`;
      const prev = byNameKey.get(key);
      if (!prev || Number(r.id) < Number(prev.id)) byNameKey.set(key, r);
    }
    const deduped = Array.from(byNameKey.values()).sort((a, b) => Number(a.id) - Number(b.id));
    return { data: deduped };
  }
};

module.exports = useApiService;
