const crypto = require("crypto");

function genRequestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function requestContext(req, res, next) {
  const incoming = req.headers["x-request-id"] || req.headers["x-correlation-id"];
  const rid = String(incoming || "").trim() || genRequestId();
  req.requestId = rid;
  res.setHeader("x-request-id", rid);

  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const level = status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO";
    // Keep as single-line for log collectors
    console.log(
      JSON.stringify({
        level,
        requestId: rid,
        method: req.method,
        path: req.originalUrl || req.url,
        status,
        durationMs: ms,
        ip: req.ip,
        userId: req.user?.id || req.user?.user?.id || null,
      })
    );
  });

  next();
}

module.exports = requestContext;

