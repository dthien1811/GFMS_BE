import express from "express";
import aiController from "../../controllers/ai/ai.controller";

const router = express.Router();

router.post("/chat", aiController.chat);
router.post("/confirm", aiController.confirmAction);

export default router;