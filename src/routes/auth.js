/**
 * config all web routes
 */

import express from "express";
import authController from "../controllers/authController";
import jwtAction from "../middleware/JWTAction";
import { createAuthRateLimit } from "../middleware/authRateLimit";
import { requireTrustedOrigin } from "../middleware/csrfGuard";

let router = express.Router();
const loginLimiter = createAuthRateLimit({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 15,
  keyBuilder: (req) => `${req.ip}:${String(req.body?.email || "").toLowerCase()}:login`,
});
const refreshLimiter = createAuthRateLimit({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 80,
  keyBuilder: (req) => `${req.ip}:refresh`,
});

let authRoute = (app) => {
  //----------------------
  router.post("/register", authController.handleRegister);
  router.post("/login", loginLimiter, authController.handleLogin);
  router.post("/google", loginLimiter, authController.handleGoogleLogin);
  router.post("/refresh", requireTrustedOrigin, refreshLimiter, authController.handleRefresh);
  router.get("/me", jwtAction.checkUserJWT, authController.handleMe);

  // ✅ logout: clear cookie jwt
  router.post("/logout", requireTrustedOrigin, authController.handleLogout);

  router.post("/forgot-password", authController.handleForgotPassword);
  router.post("/verify-otp", authController.handleVerifyOTP);
  router.post("/reset-password", authController.handleResetPassword);
  router.get("/check-rate-limit", authController.handleCheckRateLimit);

  return app.use("/auth", router);
};

module.exports = authRoute;
