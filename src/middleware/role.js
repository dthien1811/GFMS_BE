const db = require("../models");

const requireGroupName = (allowedNames = []) => {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) return res.status(401).json({ message: "Unauthenticated" });

      const user = await db.User.findByPk(req.user.id, {
        include: [{ model: db.Group, attributes: ["name"] }],
      });

      const groupName = user?.Group?.name;
      if (!groupName) return res.status(403).json({ message: "Forbidden" });

      // so sánh không phân biệt hoa thường
      const ok = allowedNames.some(
        (n) => n.toLowerCase() === groupName.toLowerCase()
      );

      if (!ok) return res.status(403).json({ message: "Forbidden" });

      // tiện cho controller dùng
      req.user.groupName = groupName;

      return next();
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  };
};

module.exports = { requireGroupName };
