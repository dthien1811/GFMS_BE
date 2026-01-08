import jwtService from "../service/JWTService";
import db from "../models";
import jwt from "jsonwebtoken";

const verifyToken = (req, res, next) => {
  // ✅ bỏ qua preflight
  if (req.method === "OPTIONS") return next();

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

export const requireRole = (roleName) => {
  return async (req, res, next) => {
    try {
      // Nếu bạn quản role theo Group thì cần map groupId -> roleName
      // Tạm làm đơn giản: dùng groupId quy ước hoặc query DB
      const user = await db.User.findByPk(req.user.id, {
        include: [{ model: db.Group, attributes: ["name"] }],
      });

      if (!user?.Group?.name) {
        return res.status(403).json({ message: "No role/group assigned" });
      }

      if (user.Group.name !== roleName) {
        return res.status(403).json({ message: "Forbidden" });
      }

      return next();
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  };
};
export default verifyToken;
