import express from "express";
import ownerDashboardController from "../../controllers/owner/ownerDashboardController";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

router.get("/summary", ownerDashboardController.getSummary);

export default router;
