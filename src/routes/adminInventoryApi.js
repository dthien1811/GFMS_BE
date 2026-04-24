"use strict";

const express = require("express");
const router = express.Router();

// Controllers
const adminInventoryController = require("../controllers/adminInventoryController");
const adminPurchaseWorkflowController = require("../controllers/adminPurchaseWorkflowController");
const adminAdminCoreController = require("../controllers/adminAdminCoreController");
const adminFranchiseContractController = require("../controllers/adminFranchiseContractController");
const adminEquipmentAssetController = require("../controllers/adminEquipmentAssetController");

// ✅ NEW: Trainer Share Override enterprise controller
const adminTrainerShareOverrideController = require("../controllers/adminTrainerShareOverrideController");

// Middleware
const jwtAction = require("../middleware/JWTAction");
const { checkUserPermission, requirePermissions } = require("../middleware/permission");

const { uploadEquipmentImages } = require("../middleware/uploadEquipmentImages");

// ========================
// PROTECT ALL ROUTES
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

// ========================
// MODULE 1: INVENTORY / EQUIPMENT
// ========================
router.get("/gyms", adminInventoryController.getGyms);
router.get("/equipment-categories", adminInventoryController.getEquipmentCategories);
router.get("/equipments", adminInventoryController.getEquipments);

router.post("/equipments", requirePermissions(["perm:equipment:write"]), adminInventoryController.createEquipment);
router.put("/equipments/:id", requirePermissions(["perm:equipment:write"]), adminInventoryController.updateEquipment);
router.patch("/equipments/:id/discontinue", requirePermissions(["perm:equipment:write"]), adminInventoryController.discontinueEquipment);
router.delete("/equipments/:id", requirePermissions(["perm:equipment:write"]), adminInventoryController.deleteEquipment);

// Images
router.get("/equipments/:id/images", adminInventoryController.getEquipmentImages);
router.post("/equipments/:id/images", uploadEquipmentImages, adminInventoryController.uploadEquipmentImages);
router.patch("/equipments/:id/images/:imageId/primary", adminInventoryController.setPrimaryEquipmentImage);
router.delete("/equipments/:id/images/:imageId", adminInventoryController.deleteEquipmentImage);

// Suppliers
router.get("/suppliers", adminInventoryController.getSuppliers);
router.post("/suppliers", adminInventoryController.createSupplier);
router.put("/suppliers/:id", adminInventoryController.updateSupplier);
router.patch("/suppliers/:id/active", adminInventoryController.setSupplierActive);

// Stocks + logs
router.get("/stocks", adminInventoryController.getStocks);
router.post("/receipts", adminInventoryController.createReceipt);
router.post("/exports", adminInventoryController.createExport);
router.get("/inventory-logs", adminInventoryController.getInventoryLogs);

// ========================
// MODULE 2: EQUIPMENT COMBO + PURCHASE WORKFLOW
// ========================
router.get("/equipment-combos", adminPurchaseWorkflowController.getEquipmentCombos);
router.get("/equipment-combos/:id", adminPurchaseWorkflowController.getEquipmentComboDetail);
router.post("/equipment-combos", adminPurchaseWorkflowController.createEquipmentCombo);
router.put("/equipment-combos/:id", adminPurchaseWorkflowController.updateEquipmentCombo);
router.delete("/equipment-combos/:id", adminPurchaseWorkflowController.deleteEquipmentCombo);
router.patch("/equipment-combos/:id/selling", adminPurchaseWorkflowController.toggleEquipmentComboSelling);

// ========================
// MODULE 2: PURCHASE WORKFLOW
// ========================
router.get("/purchase-requests", adminPurchaseWorkflowController.getPurchaseRequests);
router.get("/purchase-transactions", adminPurchaseWorkflowController.getEquipmentSalesTransactions);
router.get("/purchase-requests/:id", adminPurchaseWorkflowController.getPurchaseRequestDetail);
router.patch("/purchase-requests/:id/reject", adminPurchaseWorkflowController.rejectPurchaseRequest);
router.patch("/purchase-requests/:id/approve", adminPurchaseWorkflowController.approvePurchaseRequest);
router.patch(
  "/purchase-requests/:id/confirm-payment-and-ship",
  requirePermissions(["perm:purchase_workflow:ship"]),
  adminPurchaseWorkflowController.confirmPurchaseRequestPaymentAndShip
);
router.post("/purchase-requests/:id/convert-to-quotation", adminPurchaseWorkflowController.convertPurchaseRequestToQuotation);

router.get("/quotations", adminPurchaseWorkflowController.getQuotations);
router.get("/quotations/:id", adminPurchaseWorkflowController.getQuotationDetail);
router.patch("/quotations/:id/quote", adminPurchaseWorkflowController.quoteQuotation);
router.patch("/quotations/:id/approve", adminPurchaseWorkflowController.approveQuotation);
router.patch("/quotations/:id/reject", adminPurchaseWorkflowController.rejectQuotation);
router.post("/quotations/:id/convert-to-po", adminPurchaseWorkflowController.createPOFromQuotation);

// PO
router.get("/purchase-orders", adminPurchaseWorkflowController.getPurchaseOrders);
router.get("/purchase-orders/:id", adminPurchaseWorkflowController.getPurchaseOrderDetail);
router.patch("/purchase-orders/:id/approve", adminPurchaseWorkflowController.approvePurchaseOrder);
router.patch("/purchase-orders/:id/order", adminPurchaseWorkflowController.orderPurchaseOrder);
router.patch("/purchase-orders/:id/cancel", adminPurchaseWorkflowController.cancelPurchaseOrder);

// Receipts
router.get("/receipts", adminPurchaseWorkflowController.getReceipts);
router.get("/receipts/:id", adminPurchaseWorkflowController.getReceiptDetail);
router.patch("/receipts/:id/items", adminPurchaseWorkflowController.updateReceiptItems);
router.post("/purchase-orders/:id/receipts/inbound", adminPurchaseWorkflowController.createInboundReceiptFromPO);
router.patch("/receipts/:id/complete", adminPurchaseWorkflowController.completeReceipt);

// Payments
router.get("/purchase-orders/:id/payments", adminPurchaseWorkflowController.getPOPayments);
router.post("/purchase-orders/:id/payments", adminPurchaseWorkflowController.createPOPayment);

// Activity timeline (enterprise)
router.get("/purchase-orders/:id/timeline", adminPurchaseWorkflowController.getPOTimeline);

// ========================
// MODULE X: EQUIPMENT ASSETS (QR lifecycle)
// ========================
router.get("/equipment-assets/summary", adminEquipmentAssetController.summary);
router.get("/equipment-assets", adminEquipmentAssetController.list);
router.get("/equipment-assets/:id", adminEquipmentAssetController.detail);
router.get("/equipment-assets/:id/qr", adminEquipmentAssetController.getQr);
router.post(
  "/equipment-assets/:id/regenerate-qr",
  requirePermissions(["perm:equipment_assets:qr_regenerate"]),
  adminEquipmentAssetController.regenerateQr
);

// ========================
// MODULE 3: MAINTENANCE + FRANCHISE + POLICY + TRAINER SHARE + REPORT
// ========================

// ✅ technicians dropdown (Assign Technician modal)
router.get("/technicians", adminAdminCoreController.getTechnicians);

router.get("/dashboard/overview", adminAdminCoreController.getDashboardOverview);

// Maintenance
router.get("/maintenances", adminAdminCoreController.getMaintenances);
router.get("/maintenances/:id", adminAdminCoreController.getMaintenanceDetail);
router.patch("/maintenances/:id/approve", requirePermissions(["perm:maintenance:transition"]), adminAdminCoreController.approveMaintenance);
router.patch("/maintenances/:id/reject", requirePermissions(["perm:maintenance:transition"]), adminAdminCoreController.rejectMaintenance);
router.patch("/maintenances/:id/assign", requirePermissions(["perm:maintenance:transition"]), adminAdminCoreController.assignMaintenance);
router.patch("/maintenances/:id/start", requirePermissions(["perm:maintenance:transition"]), adminAdminCoreController.startMaintenance);
router.patch("/maintenances/:id/complete", requirePermissions(["perm:maintenance:transition"]), adminAdminCoreController.completeMaintenance);

// Franchise Requests
router.get("/franchise-requests", adminAdminCoreController.getFranchiseRequests);
router.get("/franchise-requests/:id", adminAdminCoreController.getFranchiseRequestDetail);
router.patch("/franchise-requests/:id/approve", adminAdminCoreController.approveFranchiseRequest);
router.patch("/franchise-requests/:id/reject", adminAdminCoreController.rejectFranchiseRequest);

// Franchise Contract
router.patch("/franchise-contract/:id/send", adminFranchiseContractController.sendContract);
// FE expects these enterprise-style endpoints
router.patch("/franchise-contract/:id/resend", adminFranchiseContractController.resendInvite);
router.patch("/franchise-contract/:id/countersign", adminFranchiseContractController.adminCountersign);
router.patch("/franchise-contract/:id/simulate/:event", adminFranchiseContractController.simulateEvent);
router.get("/franchise-contract/:id/status", adminFranchiseContractController.getStatus);
router.get("/franchise-contract/:id/document", adminFranchiseContractController.downloadDocument);
router.patch("/franchise-contract/:id/mock/viewed", adminFranchiseContractController.mockMarkViewed);
router.patch("/franchise-contract/:id/mock/signed", adminFranchiseContractController.mockMarkSigned);
router.patch("/franchise-contract/:id/mock/completed", adminFranchiseContractController.mockMarkCompleted);

// Policies
router.get("/policies", adminAdminCoreController.getPolicies);

// ✅ NEW: effective policy (ưu tiên gym -> fallback system)
// (đặt TRƯỚC /policies/:id để tránh bị nuốt param)
router.get("/policies/effective", adminAdminCoreController.getEffectivePolicy);

router.post("/policies", adminAdminCoreController.createPolicy);
router.put("/policies/:id", adminAdminCoreController.updatePolicy);
router.patch("/policies/:id/toggle", adminAdminCoreController.togglePolicy);

// Trainer Shares
router.get("/trainer-shares", adminAdminCoreController.getTrainerShares);
router.get("/trainer-shares/:id", adminAdminCoreController.getTrainerShareDetail);
router.patch("/trainer-shares/:id/approve", adminAdminCoreController.approveTrainerShare);
router.patch("/trainer-shares/:id/reject", adminAdminCoreController.rejectTrainerShare);

// ✅ legacy override route still kept
router.patch("/trainer-shares/:id/override", adminTrainerShareOverrideController.createForTrainerShare);

// ========================
// ✅ ENTERPRISE: TRAINER SHARE OVERRIDES
// ========================

// LIST overrides: GET /api/admin/inventory/trainer-share-overrides?trainerShareId=...
router.get("/trainer-share-overrides", adminTrainerShareOverrideController.list);

// CREATE request: POST /api/admin/inventory/trainer-share-overrides
router.post("/trainer-share-overrides", adminTrainerShareOverrideController.create);

// UPDATE request: PUT /api/admin/inventory/trainer-share-overrides/:id
router.put("/trainer-share-overrides/:id", adminTrainerShareOverrideController.update);

// APPROVE/REVOKE/TOGGLE: hỗ trợ cả PATCH lẫn POST để FE gọi kiểu nào cũng không vỡ
router.patch("/trainer-share-overrides/:id/approve", adminTrainerShareOverrideController.approve);
router.post("/trainer-share-overrides/:id/approve", adminTrainerShareOverrideController.approve);

router.patch("/trainer-share-overrides/:id/revoke", adminTrainerShareOverrideController.revoke);
router.post("/trainer-share-overrides/:id/revoke", adminTrainerShareOverrideController.revoke);

router.patch("/trainer-share-overrides/:id/toggle", adminTrainerShareOverrideController.toggle);
router.post("/trainer-share-overrides/:id/toggle", adminTrainerShareOverrideController.toggle);

// EFFECTIVE/RESOLVE
// GET /api/admin/inventory/trainer-share-overrides/effective?trainerShareId=...&at=...
router.get("/trainer-share-overrides/effective", adminTrainerShareOverrideController.effective);

// GET /api/admin/inventory/trainer-share-overrides/resolve?trainerShareId=...&at=...
router.get("/trainer-share-overrides/resolve", adminTrainerShareOverrideController.resolve);

// AUDITS (enterprise chuẩn): query theo trainerShareId
// GET /api/admin/inventory/trainer-share-overrides/audits?trainerShareId=...
router.get("/trainer-share-overrides/audits", adminTrainerShareOverrideController.audits);

// AUDITS (giữ tương thích nếu code cũ đang dùng theo overrideId)
// GET /api/admin/inventory/trainer-share-overrides/:id/audits
router.get("/trainer-share-overrides/:id/audits", adminTrainerShareOverrideController.audits);

// DELETE (nếu bạn vẫn giữ)
// (Enterprise thường không khuyến nghị hard delete; nhưng bạn có thì cứ giữ)
router.delete("/trainer-share-overrides/:id", adminTrainerShareOverrideController.remove);

// Audit logs + reports
router.get("/audit-logs", adminAdminCoreController.getAuditLogs);
router.get("/reports/summary", adminAdminCoreController.getReportSummary);
router.get("/reports/revenue", adminAdminCoreController.getReportRevenue);
router.get("/reports/inventory", adminAdminCoreController.getReportInventory);
router.get("/reports/trainer-share", adminAdminCoreController.getReportTrainerShare);

module.exports = router;
