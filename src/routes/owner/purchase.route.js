import express from "express";
import ownerPurchaseController from "../../controllers/owner/purchase.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

// Combo catalog
router.get("/combos", ownerPurchaseController.getActiveCombos);
router.get("/combos/:id", ownerPurchaseController.getComboDetail);

// Suppliers
router.get("/suppliers", ownerPurchaseController.getSuppliers);
router.get("/equipments", ownerPurchaseController.getEquipmentsForPurchase);

// Purchase requests (bước 1 — nhu cầu mua từ owner)
router.get("/purchase-requests/stock-preview", ownerPurchaseController.previewPurchaseStock);
router.post("/purchase-requests", ownerPurchaseController.createPurchaseRequest);
router.get("/purchase-requests", ownerPurchaseController.getPurchaseRequests);
router.get("/purchase-requests/:id", ownerPurchaseController.getPurchaseRequestDetail);
router.post("/purchase-requests/:id/payos-link", ownerPurchaseController.createPurchaseRequestPayOSLink);
router.patch("/purchase-requests/:id/confirm-receive", ownerPurchaseController.confirmReceivePurchaseRequest);

// Quotations
router.get("/quotations", ownerPurchaseController.getQuotations);
router.get("/quotations/:id", ownerPurchaseController.getQuotationDetail);
router.post("/quotations", ownerPurchaseController.createQuotation);

// Purchase Orders
router.get("/purchase-orders", ownerPurchaseController.getPurchaseOrders);
router.get("/purchase-orders/:id", ownerPurchaseController.getPurchaseOrderDetail);

// Receipts
router.get("/receipts", ownerPurchaseController.getReceipts);
router.get("/receipts/:id", ownerPurchaseController.getReceiptDetail);

router.get("/procurement-payments", ownerPurchaseController.getProcurementPayments);
router.get("/purchase-orders/payable", ownerPurchaseController.getPayablePurchaseOrders);
router.post("/purchase-orders/:id/payos-link", ownerPurchaseController.createPurchaseOrderPayOSLink);

export default router;
