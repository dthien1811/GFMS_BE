import express from "express";
import { requireGroupName } from "../../middleware/role";
import messageController from "../../controllers/member/message.controller";

const router = express.Router();
router.use(requireGroupName(["Members", "Member"]));
router.get("/eligible", messageController.getEligibleConversations);
router.get("/with/:peerUserId", messageController.listMessages);
router.post("/with/:peerUserId", messageController.sendMessage);
router.patch("/with/:peerUserId/read", messageController.markConversationRead);

export default router;
