import express from "express";
import ownerPolicyController from "../../controllers/owner/policy.controller";
import verifyToken from "../../middleware/auth";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

// Owner only
router.use(verifyToken, requireGroupName(["Gym Owners", "Gym Owner", "Owners", "Owner"]));

// trainer share policy
router.get("/trainer-share", ownerPolicyController.listTrainerSharePolicies);
router.get("/trainer-share/effective", ownerPolicyController.getEffectiveTrainerSharePolicy);
router.post("/trainer-share", ownerPolicyController.createTrainerSharePolicy);

// generic by id
router.get("/:id", ownerPolicyController.getPolicyById);
router.put("/:id", ownerPolicyController.updateTrainerSharePolicy);
router.patch("/:id/toggle", ownerPolicyController.toggleActive);
router.delete("/:id", ownerPolicyController.deletePolicy);

export default router;
