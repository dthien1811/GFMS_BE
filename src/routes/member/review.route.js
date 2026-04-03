import express from "express";
import { requireGroupName } from "../../middleware/role";
import reviewController from "../../controllers/member/review.controller";

const router = express.Router();
router.use(requireGroupName(["Members", "Member"]));
router.get("/eligible", reviewController.getEligible);
router.get("/me", reviewController.listMine);
router.post("/", reviewController.create);

export default router;
