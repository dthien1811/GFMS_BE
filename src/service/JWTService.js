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

const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || "30d";
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "365d";
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

const createAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
};

const createRefreshToken = (payload) => {
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, REFRESH_TOKEN_SECRET);
};

// Backward-compatible aliases for old imports
const createToken = (payload) => createAccessToken(payload);
const verifyToken = (token) => verifyAccessToken(token);

module.exports = {
  getGroupWithRoles,
  getAllowedPrefixesByGroupId,
  checkPrefixPermission,
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  createToken,
  verifyToken,
};
