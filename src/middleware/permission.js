import {
  getAllowedPrefixesByGroupId,
  checkPrefixPermission,
} from "../service/JWTService";

const defaultGetPath = (req) => `${req.baseUrl}${req.path}`;
// Ví dụ: mount /admin + route /dashboard => /admin/dashboard

const parseAllowed = async (req) => {
  if (req._allowedPrefixes) return req._allowedPrefixes;
  const groupId = req.user?.groupId;
  const allowedPrefixes = await getAllowedPrefixesByGroupId(groupId);
  req._allowedPrefixes = allowedPrefixes || [];
  return req._allowedPrefixes;
};

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

      const allowedPrefixes = await parseAllowed(req);
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

// Enterprise: require explicit permission tokens in Role.url
// Example token: "perm:equipment_assets:qr_regenerate"
const requirePermissions = (required = []) => {
  const needed = Array.isArray(required) ? required.filter(Boolean) : [required].filter(Boolean);
  return async (req, res, next) => {
    try {
      const groupId = req.user?.groupId;
      if (!groupId) {
        return res.status(403).json({ EC: -1, DT: "", EM: "Forbidden (missing groupId in token)" });
      }
      if (!needed.length) return next();

      const allowed = await parseAllowed(req);
      const ok = needed.every((perm) => allowed.includes(perm));
      if (!ok) {
        return res.status(403).json({ EC: -1, DT: "", EM: "Forbidden (missing required permission)" });
      }
      return next();
    } catch (e) {
      return res.status(500).json({ EC: -1, DT: "", EM: "Permission middleware error" });
    }
  };
};

module.exports = { checkUserPermission, requirePermissions };
