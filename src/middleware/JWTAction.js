// src/middleware/JWTAction.js
require("dotenv").config();
const jwt = require("jsonwebtoken");
const jwtService = require("../service/JWTService");

// cố load db theo kiểu an toàn (vì project bạn mix ESM/CJS)
let db;
try {
  db = require("../models/index");
  db = db.default || db;
} catch (e) {
  db = null;
}

const createJWT = (payload) => {
  const key = process.env.JWT_SECRET;
  try {
    return jwt.sign(payload, key, { expiresIn: "7d" });
  } catch (err) {
    console.log(err);
    return null;
  }
};

const verifyToken = (token) => {
  try {
    return jwtService.verifyAccessToken(token);
  } catch (err) {
    return null;
  }
};

const getTokenFromReq = (req) => {
  // 1) Authorization: Bearer <token>
  const auth = req.headers?.authorization || "";
  const [type, token] = auth.split(" ");
  if (type === "Bearer" && token) return token;

  return null;
};

// ✅ middleware: bắt buộc đăng nhập + siết status active
const checkUserJWT = async (req, res, next) => {
  const token = getTokenFromReq(req);

  if (!token) {
    return res.status(401).json({
      EC: -1,
      DT: "",
      EM: "Not authenticated (missing token)",
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    // token sai/hết hạn -> clear cookie nếu có
    try {
      if (req.cookies?.refreshToken) res.clearCookie("refreshToken");
    } catch (e) {}
    return res.status(401).json({
      EC: -1,
      DT: "",
      EM: "Not authenticated (invalid/expired token)",
    });
  }

  // ✅ CHỐT NGHIỆP VỤ: nếu user bị inactive/suspended sau khi đã login
  // thì token cũ cũng không được dùng nữa
  if (!db || !db.User) {
    return res.status(500).json({
      EC: -1,
      DT: "",
      EM: "Server misconfig: DB not available in JWT middleware",
    });
  }

  const userId = decoded?.id;
  if (!userId) {
    try {
      if (req.cookies?.refreshToken) res.clearCookie("refreshToken");
    } catch (e) {}
    return res.status(401).json({
      EC: -1,
      DT: "",
      EM: "Not authenticated (invalid token payload)",
    });
  }

  const user = await db.User.findOne({
    where: { id: userId },
    attributes: ["id", "email", "username", "groupId", "status"],
    raw: true,
  });

  if (!user) {
    try {
      if (req.cookies?.refreshToken) res.clearCookie("refreshToken");
    } catch (e) {}
    return res.status(401).json({
      EC: -1,
      DT: "",
      EM: "Not authenticated (user not found)",
    });
  }

  const status = (user.status || "active").toLowerCase();
  if (status !== "active") {
    try {
      if (req.cookies?.refreshToken) res.clearCookie("refreshToken");
    } catch (e) {}
    return res.status(403).json({
      EC: -1,
      DT: "",
      EM: status === "inactive" ? "Account inactive" : "Account suspended",
    });
  }

  // attach user “chuẩn” từ DB (khuyến nghị) + payload decoded
  req.user = { ...decoded, status: user.status, groupId: user.groupId };

  return next();
};

module.exports = {
  createJWT,
  verifyToken,
  checkUserJWT,
};

// ✅ thêm default để import kiểu ESModule không bị lệch
module.exports.default = module.exports;
