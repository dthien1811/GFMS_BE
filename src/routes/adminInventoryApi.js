const express = require("express");
const adminInventoryController = require("../controllers/adminInventoryController");

const router = express.Router();

// categories
router.get("/equipment-categories", adminInventoryController.getEquipmentCategories);

// equipments
router.get("/equipments", adminInventoryController.getEquipments);
router.post("/equipments", adminInventoryController.createEquipment);
router.put("/equipments/:id", adminInventoryController.updateEquipment);
router.patch("/equipments/:id/discontinue", adminInventoryController.discontinueEquipment);

// suppliers
router.get("/suppliers", adminInventoryController.getSuppliers);
router.post("/suppliers", adminInventoryController.createSupplier);
router.put("/suppliers/:id", adminInventoryController.updateSupplier);
router.patch("/suppliers/:id/active", adminInventoryController.setSupplierActive);

// stocks
router.get("/stocks", adminInventoryController.getStocks);

// nhập kho / xuất kho
router.post("/receipts", adminInventoryController.createReceipt);
router.post("/exports", adminInventoryController.createExport);

// nhật ký kho
router.get("/inventory-logs", adminInventoryController.getInventoryLogs);

module.exports = router;
