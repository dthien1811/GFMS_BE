import express from "express";
import packageController from "../../controllers/owner/package.controller";
import verifyToken from "../../middleware/auth";      // ✅ default
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(verifyToken, requireGroupName(["Gym Owners"]));

router.get("/", packageController.getMyPackages);
router.post("/", packageController.createPackage);
router.put("/:id", packageController.updatePackage);
router.patch("/:id/toggle", packageController.togglePackage);

export default router;
