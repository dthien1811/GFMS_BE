import express from "express";
import verifyToken from "../../middleware/auth";
import { requireGroupName } from "../../middleware/role";
import memberPackageController from "../../controllers/member/package.controller";

const router = express.Router();

router.use(verifyToken, requireGroupName(["Members", "Member"]));

// UC: hội viên xem danh sách gói tập (theo gymId của member)
router.get("/", memberPackageController.listPackages);

// UC: hội viên mua gói tập
router.post("/:id/purchase", memberPackageController.purchasePackage);

export default router;
