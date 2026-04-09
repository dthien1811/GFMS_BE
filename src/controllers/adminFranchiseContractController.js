"use strict";

const path = require("path");
const axios = require("axios");
const cloudinary = require("../config/cloudinary");

const svc = require("../service/adminFranchiseContractService");
const docSvc = require("../service/franchiseContractDocumentService");
const { FranchiseRequest } = require("../models");
const { safeSend } = require("../utils/mailer");

function pickEmail(fr) {
  // ưu tiên contactEmail (người ký)
  return fr.contactEmail || fr.ownerEmail || fr.email;
}

function absFromRel(relPath) {
  return path.join(process.cwd(), relPath);
}

function isHttpUrl(s) {
  return typeof s === "string" && /^https?:\/\//i.test(s);
}

function authHeadersFromReq(req) {
  const headers = {};
  const auth = req?.headers?.authorization;
  if (auth) headers.Authorization = auth;
  const cookie = req?.headers?.cookie;
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function signedCloudinaryUrl(publicId, { resourceType = "raw", format = "pdf", type = "authenticated", expiresInSec = 10 * 60 } = {}) {
  if (!publicId) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, Number(expiresInSec) || 600);
  try {
    return cloudinary.url(publicId, {
      resource_type: resourceType,
      type,
      format,
      secure: true,
      sign_url: true,
      expires_at: expiresAt,
    });
  } catch (_e) {
    return null;
  }
}

async function fetchArrayBuffer(url, { headers = {}, timeout = 20000 } = {}) {
  return axios.get(url, { responseType: "arraybuffer", headers, timeout });
}

async function fetchStream(url, { headers = {}, timeout = 20000 } = {}) {
  return axios.get(url, { responseType: "stream", headers, timeout });
}

async function attachmentFromPathOrUrl(req, pathOrUrl, filename, { publicId = null } = {}) {
  if (!pathOrUrl) return null;

  // 1) URL: download into memory buffer
  if (isHttpUrl(pathOrUrl)) {
    const headers = authHeadersFromReq(req);

    // try direct URL (with auth header forwarded - fixes 401 when URL is internal protected endpoint)
    try {
      const r = await fetchArrayBuffer(pathOrUrl, { headers });
      return { filename, content: Buffer.from(r.data) };
    } catch (e) {
      const status = e?.response?.status;

      // 2) Cloudinary fallback (signed or direct by publicId)
      // Some environments return 401/403 for authenticated delivery OR the stored URL may be stale.
      if (publicId) {
        // try direct upload delivery first (often works even when the stored URL fails)
        try {
          const direct = cloudinary.url(publicId, {
            resource_type: "raw",
            type: "upload",
            format: "pdf",
            secure: true,
          });
          const r0 = await fetchArrayBuffer(direct);
          return { filename, content: Buffer.from(r0.data) };
        } catch (_e0) {}

        // signed authenticated
        const signedAuth = signedCloudinaryUrl(publicId, { type: "authenticated" });
        if (signedAuth) {
          try {
            const r2 = await fetchArrayBuffer(signedAuth);
            return { filename, content: Buffer.from(r2.data) };
          } catch (_e2) {}
        }

        // signed upload
        const signedUpload = signedCloudinaryUrl(publicId, { type: "upload" });
        if (signedUpload) {
          try {
            const r3 = await fetchArrayBuffer(signedUpload);
            return { filename, content: Buffer.from(r3.data) };
          } catch (_e3) {}
        }
      }

      // 3) Do not fail the whole email flow
      // eslint-disable-next-line no-console
      console.warn(
        `[mail-attach] Unable to fetch attachment (status=${status || "-"}) url=${pathOrUrl}`
      );
      return null;
    }
  }

  // 2) Local path: attach by path (nodemailer will read file)
  return { filename, path: absFromRel(pathOrUrl) };
}

async function sendContract(req, res) {
  try {
    const result = await svc.sendContract(req);

    // gửi email giống SignNow + attach ORIGINAL PDF
    const fr = result.data;
    const to = pickEmail(fr);

    let publicId = null;
    try {
      const latest = await docSvc.getLatestDocument(fr.id);
      publicId = latest?.meta?.assets?.originalPublicId || null;
    } catch (_e) {}

    const relPdf = result.document?.originalPdfPath;
    const att = relPdf
      ? await attachmentFromPathOrUrl(req, relPdf, `HopDongNhuongQuyen_${fr.id}.pdf`, { publicId })
      : null;

    if (to) {
      await safeSend({
        to,
        subject: "GFMS - Mời ký Hợp đồng nhượng quyền thương mại",
        html: `
          <p>Kính gửi <b>${fr.contactPerson || "Quý đối tác"}</b>,</p>
          <p>Yêu cầu nhượng quyền <b>#${fr.id}</b> đã được phê duyệt. Hệ thống GFMS trân trọng gửi Hợp đồng nhượng quyền thương mại để Quý đối tác xem xét và thực hiện ký điện tử.</p>
          <p><b>Liên kết ký hợp đồng:</b></p>
          <p><a href="${fr.contractUrl}">${fr.contractUrl}</a></p>
          <p><i>Liên kết có hiệu lực trong ${process.env.SIGN_LINK_TTL_HOURS || 168} giờ kể từ thời điểm phát hành.</i></p>
          ${att ? `<p>Tệp đính kèm: <b>HopDongNhuongQuyen_#${fr.id}.pdf</b></p>` : `<p><i>(Không đính kèm PDF do hệ thống không tải được file — vui lòng dùng link ký ở trên.)</i></p>`}
          <p>Trân trọng,</p>
          <p><b>GFMS</b></p>
        `,
        text: `Mời ký Hợp đồng nhượng quyền thương mại: ${fr.contractUrl}`,
        attachments: att ? [att] : undefined,
      });
    }

    // không trả rawToken ra FE
    return res.json({ ok: true, ...result, rawToken: undefined, attachmentIncluded: !!att });
  } catch (e) {
    return res
      .status(e.statusCode || 500)
      .json({ ok: false, message: e.message || "Server error" });
  }
}

async function resendInvite(req, res) {
  try {
    const result = await svc.resendInvite(req);
    const fr = result.data;
    const to = pickEmail(fr);

    let publicId = null;
    try {
      const latest = await docSvc.getLatestDocument(fr.id);
      publicId = latest?.meta?.assets?.originalPublicId || null;
    } catch (_e) {}

    const relPdf = result.document?.originalPdfPath;
    const att = relPdf
      ? await attachmentFromPathOrUrl(req, relPdf, `HopDongNhuongQuyen_${fr.id}.pdf`, { publicId })
      : null;

    if (to) {
      await safeSend({
        to,
        subject: "GFMS - Nhắc ký Hợp đồng nhượng quyền thương mại",
        html: `
          <p>Kính gửi <b>${fr.contactPerson || "Quý đối tác"}</b>,</p>
          <p>Đây là email nhắc ký Hợp đồng nhượng quyền thương mại cho yêu cầu <b>#${fr.id}</b>.</p>
          <p><b>Liên kết ký hợp đồng:</b> <a href="${fr.contractUrl}">${fr.contractUrl}</a></p>
          ${att ? `<p>Tệp đính kèm: <b>HopDongNhuongQuyen_#${fr.id}.pdf</b></p>` : `<p><i>(Không đính kèm PDF do hệ thống không tải được file — vui lòng dùng link ký ở trên.)</i></p>`}
          <p>Trân trọng,</p>
          <p><b>GFMS</b></p>
        `,
        text: `Nhắc ký Hợp đồng nhượng quyền thương mại: ${fr.contractUrl}`,
        attachments: att ? [att] : undefined,
      });
    }

    return res.json({ ok: true, ...result, rawToken: undefined, attachmentIncluded: !!att });
  } catch (e) {
    return res
      .status(e.statusCode || 500)
      .json({ ok: false, message: e.message || "Server error" });
  }
}

async function getStatus(req, res) {
  try {
    const result = await svc.getContractStatus(req);
    return res.json(result);
  } catch (e) {
    return res
      .status(e.statusCode || 500)
      .json({ ok: false, message: e.message || "Server error" });
  }
}

async function adminCountersign(req, res) {
  try {
    const result = await svc.countersign(req);
    return res.json(result);
  } catch (e) {
    return res
      .status(e.statusCode || 500)
      .json({ ok: false, message: e.message || "Server error" });
  }
}

async function simulateEvent(req, res) {
  try {
    const result = await svc.simulateEvent(req);
    return res.json(result);
  } catch (e) {
    return res
      .status(e.statusCode || 500)
      .json({ ok: false, message: e.message || "Server error" });
  }
}

// Backward compatibility: mock endpoints
async function mockMarkViewed(req, res) {
  req.params.event = "viewed";
  return simulateEvent(req, res);
}
async function mockMarkSigned(req, res) {
  req.params.event = "signed";
  return simulateEvent(req, res);
}
async function mockMarkCompleted(req, res) {
  req.params.event = "completed";
  return simulateEvent(req, res);
}

async function pipePdfStreamToRes(streamResp, res) {
  return new Promise((resolve, reject) => {
    streamResp.data.on("error", reject);
    res.on("close", resolve);
    res.on("finish", resolve);
    streamResp.data.pipe(res);
  });
}

// Admin download documents by request id
// GET /api/admin/inventory/franchise-contract/:id/document?type=original|owner_signed|final|certificate
async function downloadDocument(req, res) {
  try {
    const id = Number(req.params.id);
    const type = String(req.query.type || "final");
    const key = type.toLowerCase();

    const fr = await FranchiseRequest.findByPk(id);
    if (!fr) return res.status(404).json({ ok: false, message: "FranchiseRequest not found" });

    let resolved = await docSvc.resolveDocumentPathByType(id, type);
    if (!resolved && key === "final") {
      resolved = await docSvc.resolveDocumentPathByType(id, "owner_signed");
    }
    if (!resolved && key === "final") {
      resolved = await docSvc.resolveDocumentPathByType(id, "original");
    }
    if (!resolved && ["sent", "viewed", "signed", "completed"].includes(fr.contractStatus)) {
      try {
        await docSvc.ensureFranchiseContractHasPdf(fr);
      } catch (e) {
        console.error("[adminFranchiseContractController] ensureFranchiseContractHasPdf", e?.message || e);
      }
      resolved = await docSvc.resolveDocumentPathByType(id, type);
      if (!resolved && key === "final") {
        resolved = await docSvc.resolveDocumentPathByType(id, "owner_signed");
      }
      if (!resolved && key === "final") {
        resolved = await docSvc.resolveDocumentPathByType(id, "original");
      }
    }
    if (!resolved) return res.status(404).json({ ok: false, message: "Document not found" });

    const filenameMap = {
      original: `FranchiseContract_${id}_original.pdf`,
      owner_signed: `FranchiseContract_${id}_owner_signed.pdf`,
      final: `FranchiseContract_${id}_final.pdf`,
      certificate: `FranchiseContract_${id}_certificate.pdf`,
    };
    const filename = filenameMap[key] || `FranchiseContract_${id}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Local filesystem path
    if (resolved.absPath) {
      return res.sendFile(resolved.absPath);
    }

    // Cloudinary URL (or any URL) – stream to client
    const url = resolved.relPath;
    if (!isHttpUrl(url)) {
      return res.status(500).json({ ok: false, message: "Invalid document path" });
    }

    const assets = resolved?.doc?.meta?.assets || {};
    const publicIdMap = {
      original: assets.originalPublicId,
      owner_signed: assets.ownerSignedPublicId,
      owner: assets.ownerSignedPublicId,
      final: assets.finalPublicId,
      certificate: assets.certificatePublicId,
    };
    const servedKey = String(resolved.servedType || key).toLowerCase();
    const publicId = publicIdMap[servedKey] || publicIdMap[key] || null;

    const headers = authHeadersFromReq(req);

    try {
      const r = await fetchStream(url, { headers });
      await pipePdfStreamToRes(r, res);
      return;
    } catch (e) {
      const status = e?.response?.status;
      if ((status === 401 || status === 403 || status === 404) && publicId) {
        // Try signed authenticated
        const signedAuth = signedCloudinaryUrl(publicId, { type: "authenticated" });
        if (signedAuth) {
          try {
            const r2 = await fetchStream(signedAuth);
            await pipePdfStreamToRes(r2, res);
            return;
          } catch (_e2) {}
        }
        // Try signed upload
        const signedUpload = signedCloudinaryUrl(publicId, { type: "upload" });
        if (signedUpload) {
          try {
            const r3 = await fetchStream(signedUpload);
            await pipePdfStreamToRes(r3, res);
            return;
          } catch (_e3) {}
        }
      }

      return res
        .status(502)
        .json({ ok: false, message: `Unable to fetch document (status=${status || "-"})` });
    }
  } catch (e) {
    return res
      .status(e.statusCode || 500)
      .json({ ok: false, message: e.message || "Server error" });
  }
}

module.exports = {
  sendContract,
  resendInvite,
  getStatus,
  adminCountersign,
  simulateEvent,
  mockMarkViewed,
  mockMarkSigned,
  mockMarkCompleted,
  downloadDocument,
};
