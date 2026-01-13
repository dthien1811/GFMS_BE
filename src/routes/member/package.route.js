import express from "express";
import { requireGroupName } from "../../middleware/role";
import memberPackageController from "../../controllers/member/package.controller";

const router = express.Router();

router.use(requireGroupName(["Members", "Member"]));

router.get("/", memberPackageController.listPackages);
router.post("/:id/purchase", memberPackageController.purchasePackage);

export default router;
