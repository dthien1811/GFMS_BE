import express from "express";
import ownerTrainerController from "../../controllers/owner/trainer.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

router.get("/", ownerTrainerController.getMyTrainers);
router.get("/users-without-pt", ownerTrainerController.getUsersWithoutPTRole);
router.post("/", ownerTrainerController.createTrainer);
router.put("/:id", ownerTrainerController.updateTrainer);
router.delete("/:id", ownerTrainerController.deleteTrainer);
router.get("/:id/schedule", ownerTrainerController.getTrainerSchedule);

export default router;
