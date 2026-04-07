const multer = require("multer");

const fileFilter = (req, file, cb) => {
  const ok = ["image/png", "image/jpeg", "image/webp", "image/jpg"].includes(file.mimetype);
  cb(ok ? null : new Error("Only PNG/JPG/WEBP allowed"), ok);
};

module.exports = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports.default = module.exports;
