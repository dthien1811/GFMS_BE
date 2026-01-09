// src/middleware/JWTAction.js
require("dotenv").config();
const jwt = require("jsonwebtoken");

const createJWT = (payload) => {
  const key = process.env.JWT_SECRET;
  try {
    // ✅ NÊN có hạn token để tránh "đăng nhập vĩnh viễn"
    return jwt.sign(payload, key, { expiresIn: "7d" });
  } catch (err) {
    console.log(err);
    return null;
  }
};

const verifyToken = (token) => {
  const key = process.env.JWT_SECRET;
  try {
    return jwt.verify(token, key);
  } catch (err) {
    return null;
  }
};

// ✅ Nếu bạn muốn "KHÔNG login thì tuyệt đối không qua",
// hãy để false để KHÔNG đọc cookie jwt nữa.
const ALLOW_COOKIE_JWT = true;

const getTokenFromReq = (req) => {
  // 1) Authorization: Bearer <token>
  const auth = req.headers?.authorization || "";
  const [type, token] = auth.split(" ");
  if (type === "Bearer" && token) return token;

  // 2) Cookie jwt (tùy chọn)
  if (ALLOW_COOKIE_JWT && req.cookies && req.cookies.jwt) return req.cookies.jwt;

  return null;
};

// middleware: bắt buộc đăng nhập
const checkUserJWT = (req, res, next) => {
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
    return res.status(401).json({
      EC: -1,
      DT: "",
      EM: "Not authenticated (invalid/expired token)",
    });
  }

  req.user = decoded;
  return next();
};

module.exports = {
  createJWT,
  verifyToken,
  checkUserJWT,
};

// ✅ thêm default để import kiểu ESModule không bị lệch
module.exports.default = module.exports;
