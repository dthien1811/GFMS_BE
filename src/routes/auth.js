/**
 * config all web routes
 */

import express from "express";
import authController from "../controllers/authController";

let router = express.Router();

let authRoute = (app) => {
  //----------------------
  router.post("/register", authController.handleRegister);
  router.post("/login", authController.handleLogin);

  // ✅ logout: clear cookie jwt
  router.post("/logout", authController.handleLogout);

  router.post("/forgot-password", authController.handleForgotPassword);
  router.post("/verify-otp", authController.handleVerifyOTP);
  router.post("/reset-password", authController.handleResetPassword);
  router.get("/check-rate-limit", authController.handleCheckRateLimit);

  return app.use("/auth", router);
};

module.exports = authRoute;
