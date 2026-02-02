import express from "express";
import ownerTransferController from "../../controllers/owner/transfer.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

router.get("/", ownerTransferController.getTransfers);
router.post("/", ownerTransferController.createTransfer);
router.get("/:id", ownerTransferController.getTransferDetail);
router.patch("/:id/approve", ownerTransferController.approveTransfer);
router.patch("/:id/reject", ownerTransferController.rejectTransfer);
router.patch("/:id/complete", ownerTransferController.completeTransfer);

export default router;
