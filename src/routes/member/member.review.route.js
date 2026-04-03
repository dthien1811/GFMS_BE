import express from "express";
import { requireGroupName } from "../middleware/role";
import reviewController from "../controllers/review.controller";

const router = express.Router();
router.use(requireGroupName(["Members", "Member"]));
router.post("/trainer", reviewController.createTrainerReview);
router.get("/gym/:gymId/eligibility", reviewController.validateGymReview);

export default router;
