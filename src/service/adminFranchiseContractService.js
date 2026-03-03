"use strict";

const crypto = require("crypto");
const { Op } = require("sequelize");
const { FranchiseRequest, Gym, FranchiseContractAudit, sequelize } = require("../models");

const docSvc = require("./franchiseContractDocumentService");
const auditSvc = require("./franchiseContractAuditService");

/**
 * Enterprise e-sign simulation (SIGN_PROVIDER=mock)
 *
 * contractStatus: not_sent | sent | viewed | signed | completed | void
 *
 * DB columns used (FranchiseRequest):
 * - contractStatus, signProvider, contractUrl
 * - contractSigned, contractSignedAt, contractCompletedAt
 * - gymId, gymCreatedAt
 * - ownerSignTokenHash, ownerSignTokenExpiresAt, ownerSignTokenUsedAt
 *
 * Enterprise tables:
 * - franchisecontractdocument (PDF paths + sha256 hashes)
 * - franchisecontractaudit (audit trail)
 */

function err(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}
function mustIntId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw err(400, "Invalid id");
  return n;
}
function now() {
  return new Date();
}
function getProvider() {
  return (process.env.SIGN_PROVIDER || "mock").toLowerCase();
}
function ttlHours() {
  const n = Number(process.env.SIGN_LINK_TTL_HOURS || 168);
  return Number.isFinite(n) && n > 0 ? n : 168;
}
function frontendBase() {
  return process.env.FRONTEND_URL || "http://localhost:3000";
}
function tokenSecret() {
  return process.env.SIGN_TOKEN_SECRET || process.env.JWT_SECRET || "gfms_secret_token";
}

function genRawToken(frId) {
  // raw token gửi qua email (KHÔNG lưu plaintext)
  return `${frId}.${Date.now()}.${crypto.randomBytes(24).toString("hex")}`;
}
function hashToken(rawToken) {
  return crypto.createHmac("sha256", tokenSecret()).update(String(rawToken)).digest("hex");
}

function invitePolicy() {
  const cooldownSeconds = Number(process.env.SIGN_INVITE_COOLDOWN_SECONDS || 60);
  const maxPerHour = Number(process.env.SIGN_INVITE_MAX_PER_HOUR || 20);
  const maxPerDay = Number(process.env.SIGN_INVITE_MAX_PER_DAY || 120);
  const maxPerRecipientPerDay = Number(process.env.SIGN_INVITE_MAX_PER_RECIPIENT_PER_DAY || 6);
  return {
    cooldownSeconds: Number.isFinite(cooldownSeconds) && cooldownSeconds >= 0 ? cooldownSeconds : 60,
    maxPerHour: Number.isFinite(maxPerHour) && maxPerHour > 0 ? maxPerHour : 20,
    maxPerDay: Number.isFinite(maxPerDay) && maxPerDay > 0 ? maxPerDay : 120,
    maxPerRecipientPerDay: Number.isFinite(maxPerRecipientPerDay) && maxPerRecipientPerDay > 0 ? maxPerRecipientPerDay : 6,
  };
}

async function enforceInvitePolicy({ franchiseRequestId, toEmail, transaction }) {
  const pol = invitePolicy();

  const nowMs = Date.now();
  const sinceHour = new Date(nowMs - 60 * 60 * 1000);
  const sinceDay = new Date(nowMs - 24 * 60 * 60 * 1000);

  const rows = await FranchiseContractAudit.findAll({
    where: {
      franchiseRequestId,
      eventType: { [Op.in]: ["invite_sent", "invite_resent"] },
      createdAt: { [Op.gte]: sinceDay },
    },
    order: [["createdAt", "ASC"]],
    transaction,
  });

  const inHour = rows.filter((r) => r.createdAt >= sinceHour).length;
  const inDay = rows.length;
  const last = rows.length ? rows[rows.length - 1] : null;

  const recipientDay = rows.filter((r) => {
    const to = r?.meta?.to || r?.meta?.email;
    return toEmail && to && String(to).toLowerCase() === String(toEmail).toLowerCase();
  }).length;

  if (last && pol.cooldownSeconds > 0) {
    const delta = (nowMs - new Date(last.createdAt).getTime()) / 1000;
    if (delta < pol.cooldownSeconds) {
      throw err(429, `Invite cooldown: wait ${Math.ceil(pol.cooldownSeconds - delta)}s`);
    }
  }

  if (inHour >= pol.maxPerHour) throw err(429, `Invite limit/hour exceeded (${inHour}/${pol.maxPerHour})`);
  if (inDay >= pol.maxPerDay) throw err(429, `Invite limit/day exceeded (${inDay}/${pol.maxPerDay})`);
  if (recipientDay >= pol.maxPerRecipientPerDay)
    throw err(429, `Invite limit per-recipient/day exceeded (${recipientDay}/${pol.maxPerRecipientPerDay})`);
}

function validateSignatureDataUrl(signatureDataUrl) {
  if (!signatureDataUrl) throw err(400, "Missing signatureDataUrl");
  const s = String(signatureDataUrl);

  // basic format: data:image/png;base64,...
  const m = s.match(/^data:image\/(png|jpeg);base64,(.+)$/i);
  if (!m) throw err(400, "signatureDataUrl must be base64 data:image/png|jpeg");

  const b64 = m[2] || "";
  // approx size: 3/4 of base64 length
  const approxBytes = Math.floor((b64.length * 3) / 4);
  const maxBytes = Number(process.env.SIGN_SIGNATURE_MAX_BYTES || 200_000); // 200KB
  if (approxBytes > maxBytes) throw err(413, `Signature too large (${approxBytes} bytes)`);

  return true;
}

function sanitizeSignerName(name) {
  const n = String(name || "").trim();
  const safe = n.replace(/[\u000D\u000A]/g, " ").slice(0, 80);
  return safe || "Signer";
}

async function lockRequest(id, t) {
  const fr = await FranchiseRequest.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!fr) throw err(404, "FranchiseRequest not found");
  return fr;
}

/**
 * Admin: Send contract invite email (generate new token + contractUrl + ORIGINAL PDF)
 */
async function sendContract(req) {
  if (getProvider() !== "mock") throw err(400, "This project demo supports SIGN_PROVIDER=mock only");

  const id = mustIntId(req.params.id);

  return await sequelize.transaction(async (t) => {
    const fr = await lockRequest(id, t);

    if (fr.status !== "approved") {
      throw err(400, `Only APPROVED request can send contract (current: ${fr.status})`);
    }
    if (fr.contractStatus === "completed") {
      return { ok: true, message: "Already completed. No need to send.", data: fr };
    }
    if (!fr.contactEmail) throw err(400, "Missing contactEmail on FranchiseRequest");

    await enforceInvitePolicy({ franchiseRequestId: fr.id, toEmail: fr.contactEmail, transaction: t });

    // Generate ORIGINAL PDF (enterprise)
    const pdfResult = await docSvc.generateOriginalPdf(fr, { transaction: t, forceNewVersion: false });
    await auditSvc.logEvent({
      franchiseRequestId: fr.id,
      documentId: pdfResult.doc.id,
      eventType: "pdf_generated",
      actorRole: "system",
      transaction: t,
      meta: { version: pdfResult.doc.version, sha256: pdfResult.sha256 },
    });

    const raw = genRawToken(fr.id);
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + ttlHours() * 60 * 60 * 1000);
    const contractUrl = `${frontendBase()}/sign-contract?token=${encodeURIComponent(raw)}`;

    await fr.update(
      {
        signProvider: "mock",
        contractUrl,
        contractStatus: "sent",
        ownerSignTokenHash: tokenHash,
        ownerSignTokenExpiresAt: expiresAt,
        ownerSignTokenUsedAt: null,
      },
      { transaction: t }
    );

    await auditSvc.logEvent({
      franchiseRequestId: fr.id,
      documentId: pdfResult.doc.id,
      eventType: "invite_sent",
      actorRole: "admin",
      transaction: t,
      meta: { to: fr.contactEmail, expiresAt: expiresAt.toISOString() },
    });

    return {
      ok: true,
      message: "Invite sent (mock)",
      data: fr,
      rawToken: raw, // controller will hide
      document: {
        id: pdfResult.doc.id,
        version: pdfResult.doc.version,
        originalPdfPath: pdfResult.doc.originalPdfPath,
        originalSha256: pdfResult.doc.originalSha256,
      },
    };
  });
}

/**
 * Admin: Resend invite (regenerate token + NEW VERSION PDF)
 */
async function resendInvite(req) {
  if (getProvider() !== "mock") throw err(400, "This project demo supports SIGN_PROVIDER=mock only");

  const id = mustIntId(req.params.id);

  return await sequelize.transaction(async (t) => {
    const fr = await lockRequest(id, t);

    if (fr.status !== "approved") {
      throw err(400, `Only APPROVED request can resend invite (current: ${fr.status})`);
    }
    if (fr.contractStatus === "completed") throw err(400, "Contract already completed");
    if (fr.contractStatus === "void") throw err(400, "Contract is void");
    if (!fr.contactEmail) throw err(400, "Missing contactEmail on FranchiseRequest");

    await enforceInvitePolicy({ franchiseRequestId: fr.id, toEmail: fr.contactEmail, transaction: t });

    // New version contract PDF
    const pdfResult = await docSvc.generateOriginalPdf(fr, { transaction: t, forceNewVersion: true });
    await auditSvc.logEvent({
      franchiseRequestId: fr.id,
      documentId: pdfResult.doc.id,
      eventType: "pdf_generated",
      actorRole: "system",
      transaction: t,
      meta: { version: pdfResult.doc.version, sha256: pdfResult.sha256, reason: "resend" },
    });

    const raw = genRawToken(fr.id);
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + ttlHours() * 60 * 60 * 1000);
    const contractUrl = `${frontendBase()}/sign-contract?token=${encodeURIComponent(raw)}`;

    await fr.update(
      {
        signProvider: "mock",
        contractUrl,
        contractStatus: "sent",
        ownerSignTokenHash: tokenHash,
        ownerSignTokenExpiresAt: expiresAt,
        ownerSignTokenUsedAt: null,
      },
      { transaction: t }
    );

    await auditSvc.logEvent({
      franchiseRequestId: fr.id,
      documentId: pdfResult.doc.id,
      eventType: "invite_resent",
      actorRole: "admin",
      transaction: t,
      meta: { to: fr.contactEmail, expiresAt: expiresAt.toISOString() },
    });

    return {
      ok: true,
      message: "Invite resent (mock)",
      data: fr,
      rawToken: raw,
      document: {
        id: pdfResult.doc.id,
        version: pdfResult.doc.version,
        originalPdfPath: pdfResult.doc.originalPdfPath,
        originalSha256: pdfResult.doc.originalSha256,
      },
    };
  });
}

/**
 * Public: Owner open link -> mark viewed
 * NOTE: allow viewing even if token was already used (only block SIGN action).
 */
async function markViewedByToken(rawToken, { ip = null, userAgent = null } = {}) {
  if (getProvider() !== "mock") throw err(400, "Demo supports SIGN_PROVIDER=mock only");

  const tokenHash = hashToken(rawToken);

  return await sequelize.transaction(async (t) => {
    const fr = await FranchiseRequest.findOne({
      where: { ownerSignTokenHash: tokenHash },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!fr) throw err(404, "Invalid or expired link");

    if (fr.ownerSignTokenExpiresAt && now() > fr.ownerSignTokenExpiresAt) throw err(410, "Link expired");

    let changed = false;
    if (fr.contractStatus === "sent") {
      await fr.update({ contractStatus: "viewed" }, { transaction: t });
      changed = true;
    }

    const latestDoc = await docSvc.getLatestDocument(fr.id, { transaction: t });
    if (changed || fr.contractStatus === "viewed") {
      await auditSvc.logEvent({
        franchiseRequestId: fr.id,
        documentId: latestDoc?.id || null,
        eventType: "viewed",
        actorRole: "owner",
        ip,
        userAgent,
        transaction: t,
      });
    }

    return { ok: true, data: fr };
  });
}

/**
 * Public: Owner sign by token (embed signature into PDF)
 */
async function ownerSignByToken(rawToken, { signatureDataUrl, signerName, consent = false, consentVersion = 'v1', ip = null, userAgent = null } = {}) {
  if (getProvider() !== "mock") throw err(400, "Demo supports SIGN_PROVIDER=mock only");

  const tokenHash = hashToken(rawToken);

  return await sequelize.transaction(async (t) => {
    const fr = await FranchiseRequest.findOne({
      where: { ownerSignTokenHash: tokenHash },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!fr) throw err(404, "Invalid or expired link");

    if (fr.ownerSignTokenExpiresAt && now() > fr.ownerSignTokenExpiresAt) throw err(410, "Link expired");
    if (fr.ownerSignTokenUsedAt) throw err(410, "Link already used");

    if (fr.status !== "approved") throw err(400, `Request is not approved (status=${fr.status})`);
    if (!["sent", "viewed"].includes(fr.contractStatus)) {
      throw err(400, `Contract not ready to sign (contractStatus=${fr.contractStatus})`);
    }

    if (consent !== true) throw err(400, 'Consent is required (consent=true)');
    const consentAt = now();
    const signingSessionId = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));

    validateSignatureDataUrl(signatureDataUrl);
    signerName = sanitizeSignerName(signerName);

    const signRes = await docSvc.ownerSign(fr, { signatureDataUrl, signerName, ip, userAgent, consentAt, consentVersion, signingSessionId, transaction: t });

    await fr.update(
      {
        contractStatus: "signed",
        contractSigned: 1,
        contractSignedAt: now(),
        ownerSignTokenUsedAt: now(),
      },
      { transaction: t }
    );

    await auditSvc.logEvent({
      franchiseRequestId: fr.id,
      documentId: signRes.doc.id,
      eventType: "owner_signed",
      actorRole: "owner",
      ip,
      userAgent,
      transaction: t,
      meta: { signerName: signerName || null, sha256: signRes.sha256, inputSha256: signRes.inputSha256 || null, consent: true, consentAt: consentAt.toISOString(), consentVersion, signingSessionId },
    });

    return { ok: true, message: "Owner signed", data: fr, document: signRes.doc };
  });
}

/**
 * Admin: Countersign (embed admin signature, generate certificate, create gym, freeze document)
 */
async function countersign(req) {
  if (getProvider() !== "mock") throw err(400, "Demo supports SIGN_PROVIDER=mock only");
  const id = mustIntId(req.params.id);

  const signatureDataUrl = req.body?.signatureDataUrl;
  let signerName = req.body?.signerName || "Admin";

  validateSignatureDataUrl(signatureDataUrl);
  signerName = sanitizeSignerName(signerName);

  const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress;
  const userAgent = req.headers["user-agent"];

  const signingSessionId = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));

  return await sequelize.transaction(async (t) => {
    const fr = await lockRequest(id, t);

    if (fr.status !== "approved") throw err(400, `Request is not approved (status=${fr.status})`);
    if (fr.contractStatus !== "signed") throw err(400, `Only SIGNED can be countersigned (current=${fr.contractStatus})`);

    const adminSignRes = await docSvc.adminCountersign(fr, { signatureDataUrl, signerName, ip, userAgent, signingSessionId, transaction: t });
    await auditSvc.logEvent({
      franchiseRequestId: fr.id,
      documentId: adminSignRes.doc.id,
      eventType: "admin_countersigned",
      actorRole: "admin",
      ip,
      userAgent,
      transaction: t,
      meta: { signerName, sha256: adminSignRes.sha256, inputSha256: adminSignRes.inputSha256 || null, signingSessionId },
    });

    // Create gym (idempotent)
    let gym = null;
    if (!fr.gymId) {
      gym = await Gym.create(
        {
          name: fr.businessName,
          address: fr.location,
          ownerId: fr.requesterId,
        },
        { transaction: t }
      );
      await fr.update({ gymId: gym.id, gymCreatedAt: now() }, { transaction: t });

      await auditSvc.logEvent({
        franchiseRequestId: fr.id,
        documentId: adminSignRes.doc.id,
        eventType: "gym_created",
        actorRole: "system",
        transaction: t,
        meta: { gymId: gym.id },
      });
    }

    // Mark completed
    await fr.update({ contractStatus: "completed", contractCompletedAt: now() }, { transaction: t });

    // Generate certificate
    const audits = await auditSvc.listEvents(fr.id, { transaction: t });
    const certRes = await docSvc.generateCertificate(fr, { audits, transaction: t });
    await auditSvc.logEvent({
      franchiseRequestId: fr.id,
      documentId: certRes.doc.id,
      eventType: "certificate_generated",
      actorRole: "system",
      transaction: t,
      meta: { sha256: certRes.sha256 },
    });

    // Freeze document
    await docSvc.freezeLatest(fr.id, { transaction: t });
    await auditSvc.logEvent({
      franchiseRequestId: fr.id,
      documentId: certRes.doc.id,
      eventType: "document_frozen",
      actorRole: "system",
      transaction: t,
    });

    await auditSvc.logEvent({
      franchiseRequestId: fr.id,
      documentId: certRes.doc.id,
      eventType: "completed",
      actorRole: "system",
      transaction: t,
    });

    return {
      ok: true,
      message: "Countersigned + completed + gym created",
      data: { franchiseRequest: fr, gym, document: certRes.doc },
    };
  });
}

/**
 * Admin: Get status
 */
async function getContractStatus(req) {
  const id = mustIntId(req.params.id);
  const fr = await FranchiseRequest.findByPk(id);
  if (!fr) throw err(404, "FranchiseRequest not found");
  const doc = await docSvc.getLatestDocument(id);
  return { ok: true, data: { franchiseRequest: fr, document: doc } };
}

/**
 * Admin: Simulate event (viewed|signed|completed) by id
 * (Kept for compatibility; does not embed real signatures.)
 */
async function simulateEvent(req) {
  const event = String(req.params.event || "").toLowerCase();
  const id = mustIntId(req.params.id);

  return await sequelize.transaction(async (t) => {
    const fr = await lockRequest(id, t);
    if (event === "viewed") {
      if (fr.contractStatus !== "sent") throw err(400, `Only SENT can be viewed (current=${fr.contractStatus})`);
      await fr.update({ contractStatus: "viewed" }, { transaction: t });
      return { ok: true, message: "Mock VIEWED", data: fr };
    }
    if (event === "signed" || event === "owner_signed") {
      if (!["sent", "viewed"].includes(fr.contractStatus)) throw err(400, `Only SENT/VIEWED can be signed`);
      await fr.update({ contractStatus: "signed", contractSigned: 1, contractSignedAt: now() }, { transaction: t });
      return { ok: true, message: "Mock SIGNED", data: fr };
    }
    if (event === "completed") {
      // old behaviour: create gym without real signatures
      if (fr.contractStatus !== "signed") throw err(400, `Only SIGNED can be completed`);
      if (!fr.gymId) {
        const gym = await Gym.create({ name: fr.businessName, address: fr.location, ownerId: fr.requesterId }, { transaction: t });
        await fr.update({ gymId: gym.id, gymCreatedAt: now() }, { transaction: t });
      }
      await fr.update({ contractStatus: "completed", contractCompletedAt: now() }, { transaction: t });
      return { ok: true, message: "Mock COMPLETED", data: fr };
    }

    if (event === "reset" || event === "reissue") {
      // Demo helper: reset contract state to allow re-issuing VN template & re-signing.
      // NOTE: does not delete previous documents/audits.
      await fr.update(
        {
          contractStatus: "not_sent",
          contractUrl: null,
          contractSigned: 0,
          contractSignedAt: null,
          contractCompletedAt: null,
          ownerSignTokenHash: null,
          ownerSignTokenExpiresAt: null,
          ownerSignTokenUsedAt: null,
        },
        { transaction: t }
      );
      return { ok: true, message: "Mock RESET (contract re-issuable)", data: fr };
    }
    throw err(400, "Invalid event. Use: viewed | signed | owner_signed | completed | reset");
  });
}

module.exports = {
  sendContract,
  resendInvite,
  getContractStatus,
  countersign,
  simulateEvent,
  markViewedByToken,
  ownerSignByToken,
};
