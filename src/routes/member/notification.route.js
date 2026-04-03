import express from "express";
import { requireGroupName } from "../../middleware/role";
import notificationController from "../../controllers/member/notification.controller";

const router = express.Router();
router.use(requireGroupName(["Members", "Member"]));
router.get("/", notificationController.listMine);
router.patch("/read-all", notificationController.markAllRead);
router.patch("/:id/read", notificationController.markRead);

export default router;
