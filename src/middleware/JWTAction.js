require("dotenv").config();
import jwt from "jsonwebtoken";

const createJWT = (payload) => {
  const key = process.env.JWT_SECRET;
  try {
    // Khuyên dùng có hạn token (tuỳ bạn)
    // return jwt.sign(payload, key, { expiresIn: "7d" });
    return jwt.sign(payload, key);
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

const getTokenFromReq = (req) => {
  // 1) Authorization: Bearer <token>
  const auth = req.headers?.authorization || "";
  const [type, token] = auth.split(" ");
  if (type === "Bearer" && token) return token;

  // 2) Cookie jwt
  if (req.cookies && req.cookies.jwt) return req.cookies.jwt;

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

  // payload phải có groupId để phân quyền
  req.user = decoded;
  return next();
};

module.exports = {
  createJWT,
  verifyToken,
  checkUserJWT,
};
