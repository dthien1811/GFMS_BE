import express from "express";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";
import ownerEquipmentAssetController from "../../controllers/owner/equipmentAsset.controller";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

router.get("/", ownerEquipmentAssetController.list);
router.get("/resolve/:qrToken", ownerEquipmentAssetController.resolveByToken);
router.get("/:id", ownerEquipmentAssetController.detail);
router.get("/:id/qr", ownerEquipmentAssetController.getQr);
router.post("/:id/maintenance-requests", ownerEquipmentAssetController.createMaintenance);

export default router;

