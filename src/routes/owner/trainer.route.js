import express from "express";
import ownerTrainerController from "../../controllers/owner/trainer.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";
import uploadTrainerCertificates from "../../middleware/uploadTrainerCertificates";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

router.get("/", ownerTrainerController.getMyTrainers);
router.get("/users-without-pt", ownerTrainerController.getUsersWithoutPTRole);
router.post("/", ownerTrainerController.createTrainer);
router.get("/:id/detail", ownerTrainerController.getTrainerDetail);
router.get("/:id/schedule", ownerTrainerController.getTrainerSchedule);
router.patch("/:id/toggle-status", ownerTrainerController.toggleTrainerStatus);
router.post("/:id/certificates", uploadTrainerCertificates.array("files", 8), ownerTrainerController.uploadTrainerCertificates);
router.put("/:id", ownerTrainerController.updateTrainer);
router.delete("/:id", ownerTrainerController.deleteTrainer);

export default router;
