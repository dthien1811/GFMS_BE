const TRUSTED_ORIGINS = new Set(
  [
    process.env.FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase())
);

const getOrigin = (req) => String(req.headers.origin || "").toLowerCase();

export const requireTrustedOrigin = (req, res, next) => {
  const origin = getOrigin(req);
  if (!origin) {
    // Allow non-browser clients (mobile app, curl, Postman) in dev.
    return next();
  }
  if (TRUSTED_ORIGINS.has(origin)) return next();
  return res.status(403).json({ EM: "Forbidden origin", EC: 1, DT: "" });
};
