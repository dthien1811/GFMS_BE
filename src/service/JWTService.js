// src/service/JWTService.js
import db from "../models/index";
import jwt from "jsonwebtoken";

// Lấy group kèm roles (dùng cho login/authorize)
const getGroupWithRoles = async (user) => {
  const group = await db.Group.findOne({
    where: { id: user.groupId },
    attributes: ["id", "name", "description"],
    include: {
      model: db.Role,
      attributes: ["id", "url", "description"],
      through: { attributes: [] },
    },
  });

  return group || {};
};

// Lấy danh sách prefix url mà group này được phép truy cập
const getAllowedPrefixesByGroupId = async (groupId) => {
  const group = await db.Group.findOne({
    where: { id: groupId },
    attributes: ["id", "name"],
    include: {
      model: db.Role,
      attributes: ["url"],
      through: { attributes: [] },
    },
  });

  const roles = group?.Roles || [];
  return roles.map((r) => r.url).filter(Boolean);
};

// prefix match
const checkPrefixPermission = (allowedPrefixes = [], path = "") => {
  if (!path) return false;
  return allowedPrefixes.some((p) => path === p || path.startsWith(p + "/"));
};

const createToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });
};

const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = {
  getGroupWithRoles,
  getAllowedPrefixesByGroupId,
  checkPrefixPermission,
  createToken,
  verifyToken,
};
