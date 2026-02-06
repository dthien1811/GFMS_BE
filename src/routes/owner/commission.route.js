import express from "express";
import ownerCommissionController from "../../controllers/owner/commission.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

router.get("/", ownerCommissionController.getCommissions);
router.get("/export", ownerCommissionController.exportCommissions);
router.get("/gym/:gymId/rate", ownerCommissionController.getGymCommissionRate);
router.post("/gym/rate", ownerCommissionController.setGymCommissionRate);
router.get("/preview-close-period", ownerCommissionController.previewClosePayrollPeriod);
router.get("/preview-pay-by-trainer", ownerCommissionController.previewPayByTrainer);
router.post("/close-period", ownerCommissionController.closePayrollPeriod);
router.post("/pay-by-trainer", ownerCommissionController.payByTrainer);

router.get("/payroll-periods", ownerCommissionController.getPayrollPeriods);
router.post("/payroll-periods/:id/pay", ownerCommissionController.payPayrollPeriod);

export default router;
