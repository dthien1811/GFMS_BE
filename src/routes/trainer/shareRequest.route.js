import express from "express";
import trainerShareRequestController from "../../controllers/trainer/trainerShareRequest.controller";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(
  requireGroupName([
    "trainer",
    "trainers",
    "Trainer",
    "Trainers",
    "PT",
    "pt",
    "Personal Trainer",
    "Personal Trainers",
    "Gym Trainer",
    "Gym Trainers",
  ])
);

router.get("/available", trainerShareRequestController.listAvailable);
router.post("/:id/claim", trainerShareRequestController.claim);

export default router;
