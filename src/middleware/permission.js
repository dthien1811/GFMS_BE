import {
  getAllowedPrefixesByGroupId,
  checkPrefixPermission,
} from "../service/JWTService";

const defaultGetPath = (req) => `${req.baseUrl}${req.path}`;
// Ví dụ: mount /admin + route /dashboard => /admin/dashboard

const checkUserPermission = (opts = {}) => {
  const { getPath = defaultGetPath } = opts;

  return async (req, res, next) => {
    try {
      const groupId = req.user?.groupId;
      if (!groupId) {
        return res.status(403).json({
          EC: -1,
          DT: "",
          EM: "Forbidden (missing groupId in token)",
        });
      }

      const allowedPrefixes = await getAllowedPrefixesByGroupId(groupId);
      const path = getPath(req);

      if (!checkPrefixPermission(allowedPrefixes, path)) {
        return res.status(403).json({
          EC: -1,
          DT: "",
          EM: "Forbidden (no permission)",
        });
      }

      return next();
    } catch (e) {
      return res.status(500).json({
        EC: -1,
        DT: "",
        EM: "Permission middleware error",
      });
    }
  };
};

module.exports = { checkUserPermission };
