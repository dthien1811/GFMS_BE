// src/routes/adminInventoryApi.js
const express = require("express");
const adminInventoryController = require("../controllers/adminInventoryController");
const adminPurchaseWorkflowController = require("../controllers/adminPurchaseWorkflowController");
const adminAdminCoreController = require("../controllers/adminAdminCoreController");
const jwtAction = require("../middleware/JWTAction");
const { checkUserPermission } = require("../middleware/permission");

const uploadEquipmentImages = require("../middleware/uploadEquipmentImages");

const router = express.Router();

// ========================
// PROTECT ALL ADMIN INVENTORY ROUTES
// ========================
router.use(jwtAction.checkUserJWT);
router.use(
  checkUserPermission({
    getPath: (req) => {
      const fullPath = `${req.baseUrl}${req.path}`;
      return fullPath.replace(/^\/api\/admin/, "/admin");
    },
  })
);

// gyms (dropdown)
router.get("/gyms", adminInventoryController.getGyms);

// categories
router.get("/equipment-categories", adminInventoryController.getEquipmentCategories);

// equipments
router.get("/equipments", adminInventoryController.getEquipments);
router.post("/equipments", adminInventoryController.createEquipment);
router.put("/equipments/:id", adminInventoryController.updateEquipment);
router.patch("/equipments/:id/discontinue", adminInventoryController.discontinueEquipment);

// images
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
router.delete("/equipments/:id/images/:imageId", adminInventoryController.deleteEquipmentImage);

// suppliers
router.get("/suppliers", adminInventoryController.getSuppliers);
router.post("/suppliers", adminInventoryController.createSupplier);
router.put("/suppliers/:id", adminInventoryController.updateSupplier);
router.patch("/suppliers/:id/active", adminInventoryController.setSupplierActive);

// stocks
router.get("/stocks", adminInventoryController.getStocks);

// nhập kho / xuất kho (cũ)
router.post("/receipts", adminInventoryController.createReceipt);
router.post("/exports", adminInventoryController.createExport);

// nhật ký kho
router.get("/inventory-logs", adminInventoryController.getInventoryLogs);

/* =========================================================
   PURCHASE WORKFLOW (1.1 -> 1.4)
========================================================= */

// QUOTATIONS
router.get("/quotations", adminPurchaseWorkflowController.getQuotations);
router.get("/quotations/:id", adminPurchaseWorkflowController.getQuotationDetail);
router.patch("/quotations/:id/quote", adminPurchaseWorkflowController.quoteQuotation);
router.patch("/quotations/:id/approve", adminPurchaseWorkflowController.approveQuotation);
router.patch("/quotations/:id/reject", adminPurchaseWorkflowController.rejectQuotation);

// PURCHASE ORDERS
router.post(
  "/purchase-orders/from-quotation/:quotationId",
  adminPurchaseWorkflowController.createPOFromQuotation
);
router.get("/purchase-orders", adminPurchaseWorkflowController.getPurchaseOrders);
router.get("/purchase-orders/:id", adminPurchaseWorkflowController.getPurchaseOrderDetail);
router.patch("/purchase-orders/:id/approve", adminPurchaseWorkflowController.approvePurchaseOrder);
router.patch("/purchase-orders/:id/order", adminPurchaseWorkflowController.orderPurchaseOrder);
router.patch("/purchase-orders/:id/cancel", adminPurchaseWorkflowController.cancelPurchaseOrder);

// RECEIPTS (inbound theo PO)
router.get("/receipts", adminPurchaseWorkflowController.getReceipts);
router.get("/receipts/:id", adminPurchaseWorkflowController.getReceiptDetail);

router.post(
  "/receipts/inbound-from-po/:purchaseOrderId",
  adminPurchaseWorkflowController.createInboundReceiptFromPO
);
router.patch("/receipts/:id/complete", adminPurchaseWorkflowController.completeReceipt);

// PAYMENTS
router.post("/purchase-orders/:id/payments", adminPurchaseWorkflowController.createPOPayment);
router.get("/purchase-orders/:id/payments", adminPurchaseWorkflowController.getPOPayments);

// ===== MODULE 2: MAINTENANCE =====
router.get("/maintenances", adminAdminCoreController.getMaintenances);
router.get("/maintenances/:id", adminAdminCoreController.getMaintenanceDetail);
router.patch("/maintenances/:id/approve", adminAdminCoreController.approveMaintenance);
router.patch("/maintenances/:id/reject", adminAdminCoreController.rejectMaintenance);
router.patch("/maintenances/:id/assign", adminAdminCoreController.assignMaintenance);
router.patch("/maintenances/:id/start", adminAdminCoreController.startMaintenance);
router.patch("/maintenances/:id/complete", adminAdminCoreController.completeMaintenance);

// ===== MODULE 3: FRANCHISE APPROVAL =====
router.get("/franchise-requests", adminAdminCoreController.getFranchiseRequests);
router.get("/franchise-requests/:id", adminAdminCoreController.getFranchiseRequestDetail);
router.patch("/franchise-requests/:id/approve", adminAdminCoreController.approveFranchiseRequest);
router.patch("/franchise-requests/:id/reject", adminAdminCoreController.rejectFranchiseRequest);

// ===== MODULE 4: SHARING POLICIES =====
router.get("/policies", adminAdminCoreController.getPolicies);
router.post("/policies", adminAdminCoreController.createPolicy);
router.put("/policies/:id", adminAdminCoreController.updatePolicy);
router.patch("/policies/:id/toggle", adminAdminCoreController.togglePolicy);

// ===== MODULE 5: TRAINER SHARE =====
router.get("/trainer-shares", adminAdminCoreController.getTrainerShares);
router.get("/trainer-shares/:id", adminAdminCoreController.getTrainerShareDetail);
router.patch("/trainer-shares/:id/approve", adminAdminCoreController.approveTrainerShare);
router.patch("/trainer-shares/:id/reject", adminAdminCoreController.rejectTrainerShare);
router.patch("/trainer-shares/:id/override", adminAdminCoreController.overrideTrainerShare);

// ===== MODULE 6.1: AUDIT LOGS =====
router.get("/audit-logs", adminAdminCoreController.getAuditLogs);

// ===== MODULE 6.2: REPORTS =====
router.get("/reports/summary", adminAdminCoreController.getReportSummary);
router.get("/reports/revenue", adminAdminCoreController.getReportRevenue);
router.get("/reports/inventory", adminAdminCoreController.getReportInventory);
router.get("/reports/trainer-share", adminAdminCoreController.getReportTrainerShare);
module.exports = router;
