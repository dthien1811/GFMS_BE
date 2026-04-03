"use strict";

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const jwtAction = require("../middleware/JWTAction");
const cloudinaryService = require("../service/cloudinaryService");

const router = express.Router();

const IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];

const CHAT_MIMES = [
  ...IMAGE_MIMES,
  "application/pdf",
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/wave",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
  "application/octet-stream",
];

function buildUploader(allowedMimes, maxMb = 20) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!allowedMimes.includes(file.mimetype)) {
        return cb(new Error("Tệp không được hỗ trợ"));
      }
      return cb(null, true);
    },
  });
}

const imageUpload = buildUploader(IMAGE_MIMES, 8);
const chatUpload = buildUploader(CHAT_MIMES, 25);

router.use(jwtAction.checkUserJWT);

function handleMulterSingle(uploader) {
  return (req, res, next) => {
    uploader.single("file")(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "Tệp vượt quá dung lượng cho phép." });
        }
        return res.status(400).json({ error: err.message || "Upload không hợp lệ." });
      }

      return res.status(400).json({ error: err?.message || "Upload không hợp lệ." });
    });
  };
}

const pickUploadedFile = (req) => {
  if (req.file) return req.file;

  if (Array.isArray(req.files) && req.files.length > 0) {
    return req.files[0];
  }

  if (req.files && typeof req.files === "object") {
    const candidates = [
      ...(Array.isArray(req.files.file) ? req.files.file : []),
      ...(Array.isArray(req.files.image) ? req.files.image : []),
      ...(Array.isArray(req.files.images) ? req.files.images : []),
    ];
    if (candidates.length > 0) return candidates[0];
  }

  return null;
};

async function saveLocal(buffer, kind, originalname, mimetype, size) {
  const dir = path.join(process.cwd(), "uploads", "chat", kind);
  fs.mkdirSync(dir, { recursive: true });

  const safeName = `${Date.now()}-${String(originalname || "asset").replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const full = path.join(dir, safeName);

  fs.writeFileSync(full, buffer);

  return {
    url: `/uploads/chat/${kind}/${safeName}`,
    fileName: originalname,
    bytes: size,
    mimeType: mimetype,
    fallback: true,
  };
}

router.post("/gym-image", handleMulterSingle(imageUpload), async (req, res) => {
  try {
    const uploadedFile = pickUploadedFile(req);

    if (!uploadedFile) {
      return res.status(400).json({
        error: "Không có file. Hãy gửi multipart field: file hoặc image",
      });
    }

    const result = await cloudinaryService.uploadImageBuffer(uploadedFile.buffer, {
      folder: "gfms/gyms",
      filename: uploadedFile.originalname,
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
      error: e?.message || "Upload gym image failed",
    });
  }
});

router.post("/avatar", handleMulterSingle(imageUpload), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Không có file" });

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
    return res.status(500).json({ error: e?.message || "Upload failed" });
  }
});

router.post("/chat-asset", handleMulterSingle(chatUpload), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Không có file" });

    const kind = String(req.body?.kind || "file").toLowerCase();
    const isImage = IMAGE_MIMES.includes(req.file.mimetype) && kind === "image";

    try {
      if (isImage) {
        const result = await cloudinaryService.uploadImageBuffer(req.file.buffer, {
          folder: "gfms/chat/images",
          filename: req.file.originalname,
        });

        return res.status(200).json({
          url: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes,
          format: result.format,
          fileName: req.file.originalname,
        });
      }

      const result = await cloudinaryService.uploadRawBuffer(req.file.buffer, {
        folder: kind === "audio" ? "gfms/chat/audio" : "gfms/chat/files",
        filename: req.file.originalname,
      });

      return res.status(200).json({
        url: result.secure_url,
        publicId: result.public_id,
        bytes: result.bytes,
        format: result.format,
        fileName: req.file.originalname,
      });
    } catch (cloudErr) {
      console.warn("UPLOAD /chat-asset cloud fallback:", cloudErr?.message || cloudErr);

      const saved = await saveLocal(
        req.file.buffer,
        kind === "audio" ? "audio" : isImage ? "image" : "file",
        req.file.originalname,
        req.file.mimetype,
        req.file.size
      );

      return res.status(200).json(saved);
    }
  } catch (e) {
    console.error("UPLOAD /chat-asset ERROR:", e);
    return res.status(500).json({ error: e?.message || "Upload failed" });
  }
});

module.exports = (app) => app.use("/api/upload", router);
module.exports.default = module.exports;