import express from "express";
import ownerMaintenanceController from "../../controllers/owner/maintenance.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

// Check JWT
router.use(jwtAction.checkUserJWT);

// Only owner
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

// List maintenances for owner's gyms
router.get("/", ownerMaintenanceController.getMaintenances);

// Get maintenance detail
router.get("/:id", ownerMaintenanceController.getMaintenanceDetail);

// Create maintenance request
router.post("/", ownerMaintenanceController.createMaintenance);

// Cancel maintenance request
router.delete("/:id", ownerMaintenanceController.cancelMaintenance);

export default router;
