"use strict";

const nodemailer = require("nodemailer");

// ===== P2 Hardening: in-memory throttle (anti-spam / Gmail limits) =====
const MAIL_LIMIT_PER_MIN = Number(process.env.MAIL_LIMIT_PER_MIN || 20);
const MAIL_LIMIT_PER_HOUR = Number(process.env.MAIL_LIMIT_PER_HOUR || 200);
const MAIL_LIMIT_PER_DAY = Number(process.env.MAIL_LIMIT_PER_DAY || 800);
const MAIL_LIMIT_PER_RECIPIENT_PER_DAY = Number(process.env.MAIL_LIMIT_PER_RECIPIENT_PER_DAY || 8);

const _mailHistory = [];

function _pruneHistory(nowMs) {
  const dayAgo = nowMs - 24 * 60 * 60 * 1000;
  while (_mailHistory.length && _mailHistory[0].ts < dayAgo) _mailHistory.shift();
}

function _countSince(nowMs, ms) {
  const since = nowMs - ms;
  let c = 0;
  for (let i = _mailHistory.length - 1; i >= 0; i--) {
    if (_mailHistory[i].ts < since) break;
    c++;
  }
  return c;
}

function _countRecipientSince(to, nowMs, ms) {
  const since = nowMs - ms;
  let c = 0;
  for (let i = _mailHistory.length - 1; i >= 0; i--) {
    const h = _mailHistory[i];
    if (h.ts < since) break;
    if (h.to === to) c++;
  }
  return c;
}

function _throttleOrThrow(to) {
  const nowMs = Date.now();
  _pruneHistory(nowMs);

  // sanitize header-injection vectors
  if (typeof to !== "string" || to.includes("\u000A") || to.includes("\u000D")) {
    const e = new Error("Invalid recipient");
    e.statusCode = 400;
    throw e;
  }

  const perMin = _countSince(nowMs, 60 * 1000);
  const perHour = _countSince(nowMs, 60 * 60 * 1000);
  const perDay = _mailHistory.length;
  const perRecipientDay = _countRecipientSince(to, nowMs, 24 * 60 * 60 * 1000);

  if (perMin >= MAIL_LIMIT_PER_MIN || perHour >= MAIL_LIMIT_PER_HOUR || perDay >= MAIL_LIMIT_PER_DAY || perRecipientDay >= MAIL_LIMIT_PER_RECIPIENT_PER_DAY) {
    const e = new Error(
      `Mail throttle hit (minute=${perMin}/${MAIL_LIMIT_PER_MIN}, hour=${perHour}/${MAIL_LIMIT_PER_HOUR}, day=${perDay}/${MAIL_LIMIT_PER_DAY}, rcpt/day=${perRecipientDay}/${MAIL_LIMIT_PER_RECIPIENT_PER_DAY})`
    );
    e.statusCode = 429;
    throw e;
  }

  _mailHistory.push({ ts: nowMs, to });
}


function isEnabled() {
  return String(process.env.MAIL_ENABLED || "false").toLowerCase() === "true";
}

let cachedTransporter = null;
let cachedStartTlsTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT || 587);
  const secure = String(process.env.MAIL_SECURE || "false").toLowerCase() === "true";
  const user = (process.env.MAIL_USER || "").trim();
  const pass = (process.env.MAIL_PASS || "").replace(/\s+/g, "");

  if (!host || !user || !pass) {
    throw new Error("MAIL config missing. Set MAIL_HOST/MAIL_USER/MAIL_PASS");
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    family: 4,
    connectionTimeout: Number(process.env.MAIL_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.MAIL_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.MAIL_SOCKET_TIMEOUT_MS || 20000),
    tls: {
      servername: host,
      minVersion: "TLSv1.2",
    },
    auth: { user, pass },
  });

  return cachedTransporter;
}

function isRetryableMailError(err) {
  if (!err) return false;
  const code = String(err.code || "").toUpperCase();
  const msg = String(err.message || "");
  return (
    code === "ECONNRESET" ||
    code === "ESOCKET" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    /ECONNRESET/i.test(msg) ||
    /Connection closed/i.test(msg)
  );
}

function createStartTlsTransporterFromEnv() {
  if (cachedStartTlsTransporter) return cachedStartTlsTransporter;
  const host = process.env.MAIL_HOST || "smtp.gmail.com";
  const user = (process.env.MAIL_USER || "").trim();
  const pass = (process.env.MAIL_PASS || "").replace(/\s+/g, "");
  if (!user || !pass) {
    throw new Error("MAIL config missing. Set MAIL_USER/MAIL_PASS");
  }

  cachedStartTlsTransporter = nodemailer.createTransport({
    host,
    port: 587,
    secure: false,
    requireTLS: true,
    family: 4,
    connectionTimeout: Number(process.env.MAIL_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.MAIL_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.MAIL_SOCKET_TIMEOUT_MS || 20000),
    tls: {
      servername: host,
      minVersion: "TLSv1.2",
    },
    auth: { user, pass },
  });
  return cachedStartTlsTransporter;
}

async function safeSend({ to, subject, html, text, attachments }) {
  if (!isEnabled()) return { ok: true, skipped: true };
  _throttleOrThrow(to);

  const from = process.env.MAIL_FROM || `GFMS <${process.env.MAIL_USER || "no-reply@gfms.local"}>`;
  const transporter = getTransporter();
  const mailOptions = {
    from,
    to,
    subject,
    text,
    html,
    attachments: Array.isArray(attachments) ? attachments : undefined,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { ok: true, skipped: false, transport: "primary" };
  } catch (err) {
    // Fallback cho môi trường reset kết nối ở SMTPS 465 (đã gặp read ECONNRESET).
    if (!isRetryableMailError(err)) throw err;

    const fallbackTransporter = createStartTlsTransporterFromEnv();
    await fallbackTransporter.sendMail(mailOptions);
    console.warn("[mailer] Primary SMTP failed, sent via STARTTLS fallback (587).");
    return { ok: true, skipped: false, transport: "fallback_587" };
  }
}

module.exports = { safeSend };
