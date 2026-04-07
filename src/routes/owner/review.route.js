import express from "express";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";
import ownerReviewController from "../../controllers/owner/review.controller";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

router.get("/", ownerReviewController.getOwnerReviews);

export default router;
