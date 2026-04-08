import express from "express";
import aiController from "../../controllers/ai/ai.controller";
import optionalUserJWT from "../../middleware/optionalJWT";

const router = express.Router();

router.post("/chat", optionalUserJWT, aiController.chat);
router.post("/confirm", optionalUserJWT, aiController.confirmAction);

export default router;
