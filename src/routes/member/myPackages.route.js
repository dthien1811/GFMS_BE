import express from "express";
import { requireGroupName } from "../../middleware/role";
import memberMyPackageController from "../../controllers/member/myPackages.controller";

const router = express.Router();

router.use(requireGroupName(["Members", "Member"]));
router.get("/", memberMyPackageController.getMyPackages);

export default router;

