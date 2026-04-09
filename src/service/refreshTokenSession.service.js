import crypto from "crypto";
import db from "../models";

const hashToken = (token) => crypto.createHash("sha256").update(String(token || "")).digest("hex");

const now = () => new Date();

const createSession = async ({
  userId,
  sessionId,
  familyId,
  refreshToken,
  expiresAt,
  rememberMe,
  ip,
  userAgent,
}) => {
  return db.RefreshTokenSession.create({
    userId,
    sessionId,
    familyId,
    tokenHash: hashToken(refreshToken),
    expiresAt,
    rememberMe: Boolean(rememberMe),
    createdByIp: ip || null,
    userAgent: userAgent || null,
    lastUsedAt: now(),
  });
};

const findActiveSession = async ({ sessionId, refreshToken }) => {
  return db.RefreshTokenSession.findOne({
    where: {
      sessionId,
      tokenHash: hashToken(refreshToken),
      revokedAt: null,
    },
  });
};

const rotateSession = async ({ session, newRefreshToken, newExpiresAt, ip, userAgent }) => {
  const newTokenHash = hashToken(newRefreshToken);
  session.replacedByTokenHash = newTokenHash;
  session.revokedAt = now();
  session.lastUsedAt = now();
  await session.save();

  return db.RefreshTokenSession.create({
    userId: session.userId,
    sessionId: crypto.randomUUID(),
    familyId: session.familyId,
    tokenHash: newTokenHash,
    expiresAt: newExpiresAt,
    rememberMe: session.rememberMe,
    createdByIp: ip || null,
    userAgent: userAgent || null,
    lastUsedAt: now(),
  });
};

const revokeFamily = async (familyId) => {
  await db.RefreshTokenSession.update(
    { revokedAt: now() },
    { where: { familyId, revokedAt: null } }
  );
};

const revokeBySessionId = async (sessionId) => {
  await db.RefreshTokenSession.update(
    { revokedAt: now() },
    { where: { sessionId, revokedAt: null } }
  );
};

const revokeAllByUserId = async (userId) => {
  await db.RefreshTokenSession.update(
    { revokedAt: now() },
    { where: { userId, revokedAt: null } }
  );
};

export default {
  createSession,
  findActiveSession,
  rotateSession,
  revokeFamily,
  revokeBySessionId,
  revokeAllByUserId,
};
