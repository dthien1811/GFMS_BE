const express = require('express');
const controller = require('../controllers/equipmentAsset.controller');
const router = express.Router();

router.get('/equipment-assets/scan/:publicToken', controller.publicScan);

module.exports = router;
