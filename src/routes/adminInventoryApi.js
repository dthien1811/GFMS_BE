import express from "express";
import adminInventoryController from "../controllers/adminInventoryController"; // ✅ FIX

const router = express.Router();

const adminInventoryApi = (app) => {
  router.get("/admin/equipments", adminInventoryController.readEquipments);
  router.post("/admin/equipments", adminInventoryController.createEquipment);
  router.put("/admin/equipments/:id", adminInventoryController.updateEquipment);
  router.patch("/admin/equipments/:id/discontinue", adminInventoryController.discontinueEquipment);

  router.get("/admin/equipment-categories", adminInventoryController.readEquipmentCategories);

  router.get("/admin/suppliers", adminInventoryController.readSuppliers);
  router.post("/admin/suppliers", adminInventoryController.createSupplier);
  router.put("/admin/suppliers/:id", adminInventoryController.updateSupplier);
  router.patch("/admin/suppliers/:id/active", adminInventoryController.setSupplierActive);

  router.get("/admin/stocks", adminInventoryController.readStocks);

  router.post("/admin/receipts", adminInventoryController.createReceiptImport);
  router.post("/admin/exports", adminInventoryController.createExport);

  return app.use("/api", router);
};

module.exports = adminInventoryApi;
