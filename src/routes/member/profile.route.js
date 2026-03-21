import express from "express";
import { requireGroupName } from "../../middleware/role";
import memberProfileController from "../../controllers/member/profile.controller";

const router = express.Router();

router.use(requireGroupName(["Members", "Member"]));

router.get("/me", memberProfileController.getMyProfile);
router.patch("/me", memberProfileController.updateMyProfile);
router.patch("/change-password", memberProfileController.changeMyPassword);

export default router;