import express from "express";
import payosController from "../../controllers/payment/payos.controller";
import payosCreateController from "../../controllers/payment/payos.create.controller";
import auth from "../../middleware/auth";

const router = express.Router();

const payosRoute = (app) => {
  // FE → tạo thanh toán (có JWT)
  router.post("/create", auth, payosCreateController.create);

  // FE → xác nhận thanh toán (khi không dùng webhook)
  router.get("/confirm", payosController.confirm);

  // PayOS → webhook (không JWT)
  router.post("/webhook", payosController.webhook);

  app.use("/api/payment/payos", router);
  return router;
};

export default payosRoute;
