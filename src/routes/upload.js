"use strict";

const express = require("express");
const multer = require("multer");

const jwtAction = require("../middleware/JWTAction");
const cloudinaryService = require("../service/cloudinaryService");

// Nếu project bạn có middleware role này thì dùng để chặn quyền theo group name
// (nếu không có, bạn có thể xoá 2 dòng requireGroupName và phần middleware requireGroupName bên dưới)
let requireGroupName = null;
try {
  // eslint-disable-next-line global-require
  ({ requireGroupName } = require("../middleware/role"));
} catch (e) {
  // ignore if not exist
}

const router = express.Router();

/**
 * ✅ Enterprise: Không ghi file xuống disk (Render/Serverless disk là ephemeral).
 * Dùng memoryStorage rồi đẩy buffer lên Cloudinary.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
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

// ✅ Protect upload routes with JWT
router.use(jwtAction.checkUserJWT);

// POST /api/upload/gym-image
// form-data: file
router.post(
  "/gym-image",
  // Nếu có requireGroupName thì chặn theo role owner, không thì bỏ qua
  ...(requireGroupName
    ? [requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"])]
    : []),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Không có file" });

      // Upload buffer lên Cloudinary
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
  }
);

module.exports = (app) => app.use("/api/upload", router);
module.exports.default = module.exports;