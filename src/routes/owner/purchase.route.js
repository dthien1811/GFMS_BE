import express from "express";
import ownerPurchaseController from "../../controllers/owner/purchase.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

// Suppliers
router.get("/suppliers", ownerPurchaseController.getSuppliers);

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

// Procurement payments
router.get("/procurement-payments", ownerPurchaseController.getProcurementPayments);

export default router;
