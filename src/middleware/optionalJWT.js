const jwtAction = require("./JWTAction");
let db = require("../models");
db = db.default || db;

const getTokenFromReq = (req) => {
  const auth = req.headers?.authorization || "";
  const [type, token] = auth.split(" ");
  if (type === "Bearer" && token) return token;
  return null;
};

const optionalUserJWT = async (req, _res, next) => {
  try {
    const token = getTokenFromReq(req);
    if (!token) return next();

    const decoded = jwtAction.verifyToken(token);
    if (!decoded?.id) return next();

    const user = await db.User.findOne({
      where: { id: decoded.id },
      attributes: ["id", "email", "username", "groupId", "status"],
      raw: true,
    });

    if (!user) return next();
    if (String(user.status || "active").toLowerCase() !== "active") return next();

    req.user = {
      ...decoded,
      id: user.id,
      email: user.email,
      username: user.username,
      groupId: user.groupId,
      status: user.status,
    };

    return next();
  } catch (e) {
    return next();
  }
};

module.exports = optionalUserJWT;
module.exports.default = optionalUserJWT;