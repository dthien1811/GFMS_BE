"use strict";

const express = require("express");
const multer = require("multer");

const jwtAction = require("../middleware/JWTAction");
const cloudinaryService = require("../service/cloudinaryService");

const router = express.Router();

// ✅ Enterprise: NEVER write to local disk on Render (ephemeral).
// Use memory storage then stream to Cloudinary.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("Only PNG/JPG/WEBP allowed"), ok);
  },
});

// ✅ Protect upload routes with JWT + permission (Admin OR Owner)
router.use(jwtAction.checkUserJWT);

router.use(async (req, res, next) => {
  try {
    const groupId = req.user?.groupId;
    if (!groupId) {
      return res.status(403).json({ EC: -1, DT: "", EM: "Forbidden (missing groupId in token)" });
    }

    // dynamic import (project mixes CJS/ESM)
    const jwtSvcMod = await import("../service/JWTService.js");
    const getAllowedPrefixesByGroupId = jwtSvcMod.getAllowedPrefixesByGroupId;
    const checkPrefixPermission = jwtSvcMod.checkPrefixPermission;

    const allowedPrefixes = await getAllowedPrefixesByGroupId(groupId);

    // Accept if group can access ANY of these prefixes
    const candidates = ["/admin", "/owner"]; // broad but still RBAC-backed
    const ok = candidates.some((p) => checkPrefixPermission(allowedPrefixes, p));

    if (!ok) {
      return res.status(403).json({ EC: -1, DT: "", EM: "Forbidden (no permission)" });
    }
    return next();
  } catch (e) {
    return res.status(500).json({ EC: -1, DT: "", EM: "Permission middleware error" });
  }
});

// POST /api/upload/gym-image
// form-data: file
router.post("/gym-image", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Không có file" });

    const result = await cloudinaryService.uploadImageBuffer(req.file.buffer, {
      folder: "gfms/gyms",
      filename: req.file.originalname,
    });

    return res.status(200).json({
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes,
      format: result.format,
      width: result.width,
      height: result.height,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Upload failed" });
  }
});

module.exports = (app) => app.use("/api/upload", router);
module.exports.default = module.exports;
