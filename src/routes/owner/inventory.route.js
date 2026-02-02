import express from "express";
import ownerInventoryController from "../../controllers/owner/inventory.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

router.get("/", ownerInventoryController.getInventory);
router.get("/:id", ownerInventoryController.getInventoryDetail);

export default router;
