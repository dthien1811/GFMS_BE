import express from "express";
import reviewController from "../../controllers/member/review.controller";

const router = express.Router();

const requireMember = (req, res, next) => {
  if (!req.user || req.user.groupId !== 4) {
    return res.status(403).json({
      EC: -1,
      EM: "Forbidden (member only)",
    });
  }
  next();
};

router.use(requireMember);

router.get("/eligible-courses", reviewController.getEligibleCourses);
router.get("/", reviewController.getMyReviews);
router.post("/", reviewController.createReview);

export default router;
