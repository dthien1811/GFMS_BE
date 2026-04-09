import express from "express";
import { requireGroupName } from "../../middleware/role";
import adminNotificationController from "../../controllers/admin/notification.controller";

const router = express.Router();
router.use(requireGroupName(["Administrators", "Administrator"]));
router.get("/", adminNotificationController.listMine);
router.patch("/read-all", adminNotificationController.markAllRead);
router.patch("/:id/read", adminNotificationController.markRead);

export default router;
