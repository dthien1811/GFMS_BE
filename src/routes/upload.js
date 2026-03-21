"use strict";

const express = require("express");
const multer = require("multer");

const jwtAction = require("../middleware/JWTAction");
const cloudinaryService = require("../service/cloudinaryService");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/gif",
    ];
    const ok = allowed.includes(file.mimetype);
    cb(ok ? null : new Error("Chỉ chấp nhận ảnh (JPG, PNG, WEBP, GIF)"), ok);
  },
});

router.use(jwtAction.checkUserJWT);

// ===== GYM IMAGE =====
router.post("/gym-image", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Không có file" });
    }

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
    console.error("UPLOAD /gym-image ERROR:", e);
    return res.status(500).json({
      error: e?.message || "Upload failed",
    });
  }
});

// ===== MEMBER AVATAR =====
router.post("/avatar", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Không có file" });
    }

    const result = await cloudinaryService.uploadImageBuffer(req.file.buffer, {
      folder: "gfms/avatars",
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
    console.error("UPLOAD /avatar ERROR:", e);
    return res.status(500).json({
      error: e?.message || "Upload failed",
    });
  }
});

module.exports = (app) => app.use("/api/upload", router);
module.exports.default = module.exports;