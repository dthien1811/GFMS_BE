import express from "express";
import ownerEquipmentController from "../../controllers/owner/equipment.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

router.get("/", ownerEquipmentController.getEquipments);
router.get("/categories", ownerEquipmentController.getCategories);
router.get("/:id", ownerEquipmentController.getEquipmentDetail);

export default router;
