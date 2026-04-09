const buckets = new Map();

const getIp = (req) =>
  req.ip ||
  req.headers["x-forwarded-for"] ||
  req.connection?.remoteAddress ||
  "unknown";

export const createAuthRateLimit = ({ windowMs, maxAttempts, keyBuilder }) => {
  return (req, res, next) => {
    const now = Date.now();
    const key = keyBuilder ? keyBuilder(req) : `${getIp(req)}:${req.path}`;
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > maxAttempts) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({
        EM: "Too many authentication attempts. Please try again later.",
        EC: 1,
        DT: { retryAfter },
      });
    }

    return next();
  };
};
