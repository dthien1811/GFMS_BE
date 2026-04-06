import express from "express";
import ownerEquipmentController from "../../controllers/owner/equipment.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

router.get("/", ownerEquipmentController.getEquipments);
router.get("/categories", ownerEquipmentController.getCategories);
router.patch("/:id/units/mark-in-use", ownerEquipmentController.markEquipmentUnitsInUse);
router.patch("/:id/units/mark-in-stock", ownerEquipmentController.markEquipmentUnitsInStock);
router.patch("/:id/units/:unitId/mark-in-use", ownerEquipmentController.markEquipmentUnitInUse);
router.patch("/:id/units/:unitId/mark-in-stock", ownerEquipmentController.markEquipmentUnitInStock);
router.get("/:id/unit-events/export", ownerEquipmentController.exportEquipmentUnitEvents);
router.get("/:id/unit-events", ownerEquipmentController.getEquipmentUnitEvents);
router.get("/:id", ownerEquipmentController.getEquipmentDetail);

export default router;
