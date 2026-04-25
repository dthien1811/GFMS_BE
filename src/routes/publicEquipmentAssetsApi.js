const express = require("express");
const router = express.Router();
const publicEquipmentAssetController = require("../controllers/publicEquipmentAssetController");
const rateLimit = require("express-rate-limit");

const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many scan requests. Please try again later." },
});

// Public scan
router.get("/equipment-assets/scan/:qrToken", scanLimiter, publicEquipmentAssetController.scan);

module.exports = router;

