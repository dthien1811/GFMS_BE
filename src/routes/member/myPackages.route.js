import express from "express";
import { requireGroupName } from "../../middleware/role";
import memberMyPackageController from "../../controllers/member/myPackages.controller";

const router = express.Router();

router.use(requireGroupName(["Members", "Member"]));

router.get("/", memberMyPackageController.getMyPackages);
router.get("/:activationId", memberMyPackageController.getMyPackageDetail);

// OPTIONAL: nếu bạn không cần thì xoá route + controller + service tương ứng
router.post("/:activationId/assign-trainer", memberMyPackageController.assignTrainer);

// ✅ main API: auto-generate lịch 4/8/12 tuần
router.post("/:activationId/week-pattern", memberMyPackageController.saveWeekPatternAndAutoBook);

export default router;