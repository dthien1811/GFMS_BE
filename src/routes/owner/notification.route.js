import express from "express";
import ownerNotificationController from "../../controllers/owner/notification.controller";

const router = express.Router();

router.get("/", ownerNotificationController.listMine);
router.patch("/read-all", ownerNotificationController.markAllRead);
router.patch("/:id/read", ownerNotificationController.markRead);

export default router;