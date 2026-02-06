import express from "express";
import ownerWithdrawalController from "../../controllers/owner/withdrawal.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

router.get("/", ownerWithdrawalController.getWithdrawals);
router.get("/export", ownerWithdrawalController.exportWithdrawals);
router.post("/:id/approve", ownerWithdrawalController.approveWithdrawal);
router.post("/:id/reject", ownerWithdrawalController.rejectWithdrawal);

export default router;
