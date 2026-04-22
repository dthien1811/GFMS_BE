"use strict";

const crypto = require("crypto");
const path = require("path");
const axios = require("axios");
const cloudinary = require("../config/cloudinary");
const { FranchiseRequest } = require("../models");
const svc = require("../service/adminFranchiseContractService");
const docSvc = require("../service/franchiseContractDocumentService");

function sendErr(res, e) {
  const status = e.statusCode || 400;
  return res.status(status).json({ message: e.message || "Bad Request" });
}

function absFromRel(relPath) {
  return path.join(process.cwd(), relPath);
}

function isHttpUrl(s) {
  return typeof s === "string" && /^https?:\/\//i.test(s);
}

function signedCloudinaryUrl(
  publicId,
  { resourceType = "raw", format = "pdf", type = "authenticated", expiresInSec = 10 * 60 } = {}
) {
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

async function fetchPdfBuffer(url, { timeout = 60000 } = {}) {
  // Buffer mode is more compatible with browser PDF viewers than piping streams.
  // (Some environments/clients may close the connection early when proxied streams are used.)
  const r = await axios.get(url, {
    responseType: "arraybuffer",
    timeout,
    // avoid axios rejecting on 302 if storage decides to redirect
    maxRedirects: 5,
  });
  return Buffer.from(r.data);
}

/** Resolve path + fallback — dùng chung trước/sau ensure PDF. */
async function resolvePublicFranchiseDoc(fr, rawType) {
  const t = String(rawType || "original").toLowerCase();
  let resolved = await docSvc.resolveDocumentPathByType(fr.id, rawType);
  // Final: final → owner_signed → original (original chỉ khi không có bản đã ký — demo/mock thiếu final).
  if (!resolved && t === "final") {
    resolved = await docSvc.resolveDocumentPathByType(fr.id, "owner_signed");
  }
  if (!resolved && t === "final") {
    resolved = await docSvc.resolveDocumentPathByType(fr.id, "original");
  }
  if (!resolved && t === "certificate" && fr.contractStatus === "completed") {
    resolved = await docSvc.resolveDocumentPathByType(fr.id, "certificate");
  }
  if (!resolved && t === "certificate" && fr.contractStatus === "completed") {
    resolved = await docSvc.resolveDocumentPathByType(fr.id, "final");
  }
  if (!resolved && t === "certificate" && fr.contractStatus === "completed") {
    resolved = await docSvc.resolveDocumentPathByType(fr.id, "owner_signed");
  }
  return resolved;
}

module.exports = {
  // GET /api/public/franchise-contract/by-token?token=...
  getByToken: async (req, res) => {
    try {
      const token = String(req.query.token || "");
      if (!token) return res.status(400).json({ message: "Missing token" });

      // mark viewed (optional)
      await svc.markViewedByToken(token, {
        ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
      });

      // Must be identical to tokenSecret() used in adminFranchiseContractService
      const secret = process.env.SIGN_TOKEN_SECRET || process.env.JWT_SECRET || "gfms_secret_token";
      const tokenHash = crypto.createHmac("sha256", secret).update(token).digest("hex");

      const fr = await FranchiseRequest.findOne({ where: { ownerSignTokenHash: tokenHash } });
      if (!fr) return res.status(404).json({ message: "Invalid or expired token" });

      const expiresAt = fr.ownerSignTokenExpiresAt ? new Date(fr.ownerSignTokenExpiresAt) : null;
      if (!expiresAt || Date.now() > expiresAt.getTime()) {
        return res.status(400).json({ message: "Signing link expired. Please ask admin to resend." });
      }

      const doc = await docSvc.getLatestDocument(fr.id);

      return res.status(200).json({
        ok: true,
        data: {
          id: fr.id,
          businessName: fr.businessName,
          location: fr.location,
          contactPerson: fr.contactPerson,
          contactEmail: fr.contactEmail,
          contractStatus: fr.contractStatus,
          // document hashes (for enterprise UI)
          document: doc
            ? {
                version: doc.version,
                originalSha256: doc.originalSha256,
                ownerSignedSha256: doc.ownerSignedSha256,
                finalSha256: doc.finalSha256,
                certificateSha256: doc.certificateSha256,
              }
            : null,
        },
      });
    } catch (e) {
      return sendErr(res, e);
    }
  },

  // GET /api/public/franchise-contract/document?token=...&type=original|owner_signed|final|certificate
  documentByToken: async (req, res) => {
    try {
      const token = String(req.query.token || "");
      const type = String(req.query.type || "original");

      if (!token) return res.status(400).json({ message: "Missing token" });

      const secret = process.env.SIGN_TOKEN_SECRET || process.env.JWT_SECRET || "gfms_secret_token";
      const tokenHash = crypto.createHmac("sha256", secret).update(token).digest("hex");

      const fr = await FranchiseRequest.findOne({ where: { ownerSignTokenHash: tokenHash } });
      if (!fr) return res.status(404).json({ message: "Invalid or expired token" });

      const expiresAt = fr.ownerSignTokenExpiresAt ? new Date(fr.ownerSignTokenExpiresAt) : null;
      if (!expiresAt || Date.now() > expiresAt.getTime()) {
        return res.status(400).json({ message: "Signing link expired. Please ask admin to resend." });
      }

      // For security: Owner can view original always.
      // owner_signed/final/certificate only if status has reached that point.
      const t = type.toLowerCase();
      if (["owner_signed", "owner"].includes(t) && !["signed", "completed"].includes(fr.contractStatus)) {
        return res.status(403).json({ message: "Owner signed document not available yet." });
      }
      // Cho phép cả "signed" (đã ký owner, chờ countersign) nếu sau này đã có file final trên storage.
      if (t === "final" && !["signed", "completed"].includes(fr.contractStatus)) {
        return res.status(403).json({ message: "Final document not available yet." });
      }
      if (t === "certificate" && fr.contractStatus !== "completed") {
        return res.status(403).json({ message: "Certificate not available yet." });
      }

      let resolved = await resolvePublicFranchiseDoc(fr, type);

      // Thiếu file trên DB → tạo bản gốc một lần (nếu được) rồi resolve lại.
      if (!resolved && ["sent", "viewed", "signed", "completed"].includes(fr.contractStatus)) {
        try {
          await docSvc.ensureFranchiseContractHasPdf(fr);
        } catch (e) {
          console.error("[publicFranchiseContractController] ensureFranchiseContractHasPdf", e?.message || e);
        }
        resolved = await resolvePublicFranchiseDoc(fr, type);
      }

      if (!resolved) return res.status(404).json({ message: "Document not found" });

      const filenameMap = {
        original: `FranchiseContract_${fr.id}_original.pdf`,
        owner_signed: `FranchiseContract_${fr.id}_owner_signed.pdf`,
        final: `FranchiseContract_${fr.id}_final.pdf`,
        certificate: `FranchiseContract_${fr.id}_certificate.pdf`,
      };
      const key = t;
      const filename = filenameMap[key] || `FranchiseContract_${fr.id}.pdf`;
      const servedType = String(resolved.servedType || t).toLowerCase();

      // ====== IMPORTANT NOTE (enterprise hardening) ======
      // In practice, streaming a remote PDF through Node (axios -> res) can fail on some networks
      // or with certain Cloudinary delivery modes. For public viewing, the most robust approach
      // is to REDIRECT the browser to the storage URL when it's already an HTTP(S) URL.
      // The signing token is the security boundary here.

      // Local filesystem path (legacy)
      if (resolved.absPath) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
        // prevent caching a tokenized resource
        res.setHeader("Cache-Control", "no-store, max-age=0");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("X-Content-Type-Options", "nosniff");
        return res.sendFile(resolved.absPath);
      }

      const url = resolved.relPath;
      if (isHttpUrl(url)) {
        // Default behavior: redirect to the storage URL (best compatibility for iframe/browser PDF viewer)
        // If you ever need proxy mode, call with &mode=proxy
        const mode = String(req.query.mode || "redirect").toLowerCase();
        if (mode !== "proxy") {
          // prevent caching a tokenized resource
          res.setHeader("Cache-Control", "no-store, max-age=0");
          res.setHeader("Pragma", "no-cache");
          return res.redirect(302, url);
        }
      }

      // Proxy/stream mode (explicit): stream to client
      if (!isHttpUrl(url)) {
        return res.status(500).json({ message: "Invalid document path" });
      }

      // headers for proxy mode
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      // prevent caching a tokenized resource
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");

      const assets = resolved?.doc?.meta?.assets || {};
      const publicIdMap = {
        original: assets.originalPublicId,
        owner_signed: assets.ownerSignedPublicId,
        owner: assets.ownerSignedPublicId,
        final: assets.finalPublicId,
        certificate: assets.certificatePublicId,
      };
      const publicId = publicIdMap[servedType] || publicIdMap[key] || null;
      try {
        // ✅ Enterprise fix: Chrome PDF viewer often sends multiple Range requests.
        // Proxy MUST forward Range to Cloudinary and stream the response, otherwise
        // the viewer can fail with "Failed to load PDF document".
        const clientRange = req.headers.range ? String(req.headers.range) : null;

        const proxyStream = async (u) => {
          const r = await axios.get(u, {
            responseType: "stream",
            timeout: 60000,
            maxRedirects: 5,
            headers: clientRange ? { Range: clientRange } : undefined,
            validateStatus: (st) => st < 500,
          });

          const ct = String(r.headers?.["content-type"] || "").toLowerCase();

          if (r.status >= 400) {
            const err = new Error("Upstream status " + r.status);
            err.response = { status: r.status };
            throw err;
          }

          // Cloudinary raw may return application/octet-stream
          if (ct && !ct.includes("pdf") && !ct.includes("octet-stream")) {
            const err = new Error("Upstream is not a PDF (content-type=" + ct + ")");
            err.response = { status: 502 };
            throw err;
          }

          res.statusCode = r.status;

          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", "inline; filename=\"" + filename + "\"");
          res.setHeader("Cache-Control", "no-store, max-age=0");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("X-Content-Type-Options", "nosniff");

          res.setHeader("Accept-Ranges", r.headers?.["accept-ranges"] || "bytes");
          if (r.headers?.["content-range"]) res.setHeader("Content-Range", r.headers["content-range"]);
          if (r.headers?.["content-length"]) res.setHeader("Content-Length", r.headers["content-length"]);
          if (r.headers?.["etag"]) res.setHeader("ETag", r.headers["etag"]);
          if (r.headers?.["last-modified"]) res.setHeader("Last-Modified", r.headers["last-modified"]);

          return await new Promise((resolve, reject) => {
            res.on("error", reject);
            r.data.on("error", reject);
            r.data.on("end", resolve);
            r.data.pipe(res);
          });
        };

        await proxyStream(url);
        return;
      } catch (e) {
        const status = e?.response?.status;

        // Cloudinary: URL cũ có thể 401/403/404; dùng publicId tạo signed URL (gần với admin downloadDocument).
        if ((status === 401 || status === 403 || status === 404) && publicId) {
          const tryFetchSigned = async (signedUrl) => {
            const clientRange2 = req.headers.range ? String(req.headers.range) : null;
            const r = await axios.get(signedUrl, {
              responseType: "stream",
              timeout: 60000,
              maxRedirects: 5,
              headers: clientRange2 ? { Range: clientRange2 } : undefined,
              validateStatus: (st) => st < 500,
            });

            const ct = String(r.headers?.["content-type"] || "").toLowerCase();
            if (r.status >= 400) {
              const err = new Error("Upstream signed status " + r.status);
              err.response = { status: r.status };
              throw err;
            }
            if (ct && !ct.includes("pdf") && !ct.includes("octet-stream")) {
              const err = new Error("Signed upstream is not a PDF (content-type=" + ct + ")");
              err.response = { status: 502 };
              throw err;
            }

            res.statusCode = r.status;
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", "inline; filename=\"" + filename + "\"");
            res.setHeader("Cache-Control", "no-store, max-age=0");
            res.setHeader("Pragma", "no-cache");
            res.setHeader("X-Content-Type-Options", "nosniff");

            res.setHeader("Accept-Ranges", r.headers?.["accept-ranges"] || "bytes");
            if (r.headers?.["content-range"]) res.setHeader("Content-Range", r.headers["content-range"]);
            if (r.headers?.["content-length"]) res.setHeader("Content-Length", r.headers["content-length"]);
            if (r.headers?.["etag"]) res.setHeader("ETag", r.headers["etag"]);
            if (r.headers?.["last-modified"]) res.setHeader("Last-Modified", r.headers["last-modified"]);

            return await new Promise((resolve, reject) => {
              res.on("error", reject);
              r.data.on("error", reject);
              r.data.on("end", resolve);
              r.data.pipe(res);
            });
          };

          const signedAuth = signedCloudinaryUrl(publicId, { type: "authenticated" });
          if (signedAuth) {
            try { return await tryFetchSigned(signedAuth); } catch (_e2) {}
          }
          const signedUpload = signedCloudinaryUrl(publicId, { type: "upload" });
          if (signedUpload) {
            try { return await tryFetchSigned(signedUpload); } catch (_e3) {}
          }
        }

        return res.status(502).json({ message: "Unable to fetch document (status=" + (status || "-") + ")" });
      }

    } catch (e) {
      return sendErr(res, e);
    }
  },

  // POST /api/public/franchise-contract/sign { token, signatureDataUrl, signerName }
  signByToken: async (req, res) => {
    try {
      const token = String(req.body?.token || "");
      const signatureDataUrl = req.body?.signatureDataUrl;
      const signerName = String(req.body?.signerName || "Owner");

      const consent = req.body?.consent === true;
      const consentVersion = String(req.body?.consentVersion || 'v1');
      if (!consent) return res.status(400).json({ message: 'Bạn phải xác nhận đồng ý ký điện tử (consent = true).' });

      if (!token) return res.status(400).json({ message: "Missing token" });

      const result = await svc.ownerSignByToken(token, {
        signatureDataUrl,
        signerName,
        consent,
        consentVersion,
        ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
      });

      const fr = result.data;

      return res.status(200).json({
        ok: true,
        message: "Đã kí thành công. Cảm ơn bạn đã hoàn tất bước ký hợp đồng. Admin sẽ xem xét và phản hồi sớm nhất có thể.",
        data: {
          id: fr.id,
          contractStatus: fr.contractStatus,
          contractSigned: fr.contractSigned,
          contractSignedAt: fr.contractSignedAt,
        },
      });
    } catch (e) {
      return sendErr(res, e);
    }
  },
};
