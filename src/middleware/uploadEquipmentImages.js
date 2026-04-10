// src/middleware/uploadEquipmentImages.js
// ✅ Enterprise: DO NOT store on local disk (Render filesystem is ephemeral).
// Use memory storage then upload to Cloudinary in service layer.
const multer = require("multer");

const fileFilter = (req, file, cb) => {
  const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
  cb(ok ? null : new Error("Only PNG/JPG/WEBP allowed"), ok);
};

module.exports = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB/file
});

module.exports.default = module.exports;
