import express from "express";
import ownerFranchiseController from "../../controllers/owner/franchise.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

// JWT đã được check ở useApi.js
router.use(jwtAction.checkUserJWT);

// Chỉ owner mới được tạo franchise request
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

// Routes cho franchise requests
router.post("/", ownerFranchiseController.createFranchiseRequest);
router.get("/", ownerFranchiseController.getMyFranchiseRequests);
router.get("/:id", ownerFranchiseController.getMyFranchiseRequestDetail);
router.put("/:id", ownerFranchiseController.updateMyFranchiseRequest);
router.delete("/:id", ownerFranchiseController.deleteMyFranchiseRequest);

export default router;
