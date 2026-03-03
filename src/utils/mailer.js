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
    auth: { user, pass },
  });

  return cachedTransporter;
}

async function safeSend({ to, subject, html, text, attachments }) {
  if (!isEnabled()) return { ok: true, skipped: true };

  const from = process.env.MAIL_FROM || `GFMS <${process.env.MAIL_USER || "no-reply@gfms.local"}>`;
  const transporter = getTransporter();

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
    attachments: Array.isArray(attachments) ? attachments : undefined,
  });

  return { ok: true, skipped: false };
}

module.exports = { safeSend };
