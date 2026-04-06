import express from "express";
import { requireGroupName } from "../../middleware/role";
import memberProfileController from "../../controllers/member/profile.controller";

const router = express.Router();

router.get("/me", requireGroupName(["Members", "Member", "Trainers", "Trainer"]), memberProfileController.getMyProfile);
router.patch("/me", requireGroupName(["Members", "Member"]), memberProfileController.updateMyProfile);
router.patch("/change-password", requireGroupName(["Members", "Member"]), memberProfileController.changeMyPassword);
router.post("/become-trainer-request", requireGroupName(["Members", "Member"]), memberProfileController.createBecomeTrainerRequest);
router.get(
	"/become-trainer-requests",
	requireGroupName(["Members", "Member", "Trainers", "Trainer"]),
	memberProfileController.getMyBecomeTrainerRequests
);

export default router;