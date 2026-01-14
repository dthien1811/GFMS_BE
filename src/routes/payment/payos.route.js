import express from "express";
import payosController from "../../controllers/payment/payos.controller";

const router = express.Router();

const payosRoute = (app) => {
  // Webhook không cần JWT
  router.post("/webhook", payosController.webhook);

  // Mount route chính: /api/payment/payos/webhook
  app.use("/api/payment/payos", router);
  
  // ✅ Alias ngắn hơn: /api/payment/webhook (để dễ nhớ)
  app.post("/api/payment/webhook", payosController.webhook);

  return router;
};

export default payosRoute;

