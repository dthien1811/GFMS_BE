import express from "express";
import verifyToken from "../../middleware/auth";
import { requireGroupName } from "../../middleware/role";
import memberMyPackageController from "../../controllers/member/myPackages.controller";

const router = express.Router();

router.use(verifyToken, requireGroupName(["Members", "Member"]));

router.get("/", memberMyPackageController.getMyPackages);

export default router;
