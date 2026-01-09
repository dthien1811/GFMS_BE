// src/routes/adminInventoryApi.js
const express = require("express");
const adminInventoryController = require("../controllers/adminInventoryController");

const jwtAction = require("../middleware/JWTAction");
const { checkUserPermission } = require("../middleware/permission");

const uploadEquipmentImages = require("../middleware/uploadEquipmentImages");

const router = express.Router();

// ========================
// ✅ PROTECT ALL ADMIN INVENTORY ROUTES
// ========================
router.use(jwtAction.checkUserJWT);
router.use(
  checkUserPermission({
    // map path thực tế: /api/admin/inventory/...  => /admin/inventory/...
    getPath: (req) => {
      const fullPath = `${req.baseUrl}${req.path}`;
      return fullPath.replace(/^\/api\/admin/, "/admin");
    },
  })
);

// ✅ gyms (dropdown)
router.get("/gyms", adminInventoryController.getGyms);

// categories
router.get("/equipment-categories", adminInventoryController.getEquipmentCategories);

// equipments
router.get("/equipments", adminInventoryController.getEquipments);
router.post("/equipments", adminInventoryController.createEquipment);
router.put("/equipments/:id", adminInventoryController.updateEquipment);
router.patch("/equipments/:id/discontinue", adminInventoryController.discontinueEquipment);

// ========================
// ✅ EQUIPMENT IMAGES (NEW)
// ========================
router.get("/equipments/:id/images", adminInventoryController.getEquipmentImages);

router.post(
  "/equipments/:id/images",
  uploadEquipmentImages.array("images", 10),
  adminInventoryController.uploadEquipmentImages
);

router.patch(
  "/equipments/:id/images/:imageId/primary",
  adminInventoryController.setPrimaryEquipmentImage
);

router.delete(
  "/equipments/:id/images/:imageId",
  adminInventoryController.deleteEquipmentImage
);

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
