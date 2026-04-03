import express from "express";
import { requireGroupName } from "../../middleware/role";
import reviewController from "../../controllers/member/review.controller";

const router = express.Router();

router.use(requireGroupName(["Members", "Member"]));

// API mới của nhánh bạn
router.get("/eligible", reviewController.getEligible);
router.get("/me", reviewController.listMine);
router.post("/", reviewController.create);

// Alias để không làm vỡ FE/dev cũ
router.get("/eligible-courses", reviewController.getEligibleCourses);
router.get("/", reviewController.getMyReviews);
router.post("/create", reviewController.createReview);

export default router;