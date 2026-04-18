import express from "express";
import ownerTrainerShareController from "../../controllers/owner/trainershare.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

// JWT đã được check ở useApi.js
router.use(jwtAction.checkUserJWT);

// Chỉ owner mới được tạo trainer share request
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

// Routes cho trainer shares
router.get("/available-trainers/:gymId", ownerTrainerShareController.getAvailableTrainers);
router.get("/received", ownerTrainerShareController.getReceivedRequests); // Phải để trước /:id
router.post("/:id/accept", ownerTrainerShareController.acceptRequest);
router.post("/:id/reject", ownerTrainerShareController.rejectRequest);
router.put("/:id/session-price", ownerTrainerShareController.updateSessionPrice);
router.post("/:id/payment-confirm", ownerTrainerShareController.confirmPayment);
router.post("/:id/payment-dispute-response", ownerTrainerShareController.respondPaymentDispute);
router.post("/", ownerTrainerShareController.createTrainerShare);
router.get("/", ownerTrainerShareController.getMyTrainerShares);
router.get("/:id", ownerTrainerShareController.getMyTrainerShareDetail);
router.put("/:id", ownerTrainerShareController.updateMyTrainerShare);
router.delete("/:id", ownerTrainerShareController.deleteMyTrainerShare);

export default router;
