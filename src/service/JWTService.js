import db from "../models/index";

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

module.exports = {
  getAllowedPrefixesByGroupId,
  checkPrefixPermission,
};
