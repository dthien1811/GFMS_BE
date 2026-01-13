// routes/owner/package.route.js
import express from "express";
import packageController from "../../controllers/owner/package.controller";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

// ✅ req.user đã có từ jwtAction.checkUserJWT ở /api
router.use(requireGroupName(["Gym Owners"]));

router.get("/", packageController.getMyPackages);
router.post("/", packageController.createPackage);
router.put("/:id", packageController.updatePackage);
router.patch("/:id/toggle", packageController.togglePackage);

export default router;
