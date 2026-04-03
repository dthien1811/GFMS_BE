import express from "express";
import { requireGroupName } from "../../middleware/role";
import trainerMessageController from "../../controllers/trainer/message.controller";

const router = express.Router();
router.use(requireGroupName(["Trainers", "Trainer"]));
router.get("/eligible", trainerMessageController.getEligibleConversations);
router.get("/with/:peerUserId", trainerMessageController.listMessages);
router.post("/with/:peerUserId", trainerMessageController.sendMessage);
router.patch("/with/:peerUserId/read", trainerMessageController.markConversationRead);

export default router;
