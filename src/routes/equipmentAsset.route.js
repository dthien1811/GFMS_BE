const express = require('express');
const controller = require('../controllers/equipmentAsset.controller');
const router = express.Router();

router.get('/admin/equipment-assets/summary', controller.adminSummary);
router.get('/admin/equipment-assets', controller.adminList);
router.get('/admin/equipment-assets/:id/qr', controller.adminQr);
router.post('/admin/equipment-assets/:id/regenerate-qr', controller.adminRegenerateQr);
router.get('/admin/equipment-assets/:id', controller.adminDetail);

router.get('/owner/equipment-assets/summary', controller.ownerSummary);
router.get('/owner/equipment-assets', controller.ownerList);
router.get('/owner/equipment-assets/:id/qr', controller.ownerQr);
router.get('/owner/equipment-assets/:id', controller.ownerDetail);

module.exports = router;
