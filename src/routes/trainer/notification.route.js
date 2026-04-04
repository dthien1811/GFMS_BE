import express from "express";
import { requireGroupName } from "../../middleware/role";
import trainerNotificationController from "../../controllers/trainer/notification.controller";

const router = express.Router();
router.use(requireGroupName(["Trainers", "Trainer"]));
router.get("/", trainerNotificationController.listMine);
router.patch("/read-all", trainerNotificationController.markAllRead);
router.patch("/:id/read", trainerNotificationController.markRead);

export default router;
