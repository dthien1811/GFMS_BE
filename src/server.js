// 🚨 BẮT BUỘC: dotenv phải ở TRÊN CÙNG
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import path from "path";
import cors from "cors";

import initWebRoutes from "./routes/web";
import authRoute from "./routes/auth";
import useApi from "./routes/useApi";
import payosRoute from "./routes/payment/payos.route";

import connectDB from "./config/connectDB";

import jwtAction from "./middleware/JWTAction";
import { checkUserPermission } from "./middleware/permission";

// CommonJS route
const adminInventoryApi = require("./routes/adminInventoryApi");

// ===== OPTIONAL ROUTES =====
let gymRoute, uploadRoute, trainerRoutes;
try {
  gymRoute = require("./routes/gym").default || require("./routes/gym");
} catch (e) {}
try {
  uploadRoute = require("./routes/upload").default || require("./routes/upload");
} catch (e) {}
try {
  trainerRoutes = require("./routes/trainer");
  trainerRoutes = trainerRoutes.default || trainerRoutes;
} catch (e) {}

const app = express();
const PORT = process.env.PORT || 8080;
const HOSTNAME = process.env.HOSTNAME || "localhost";

// ===== DEBUG ENV (chỉ để test, xong có thể xóa) =====
console.log("🔎 PAYOS ENV CHECK:", {
  PAYOS_CLIENT_ID: process.env.PAYOS_CLIENT_ID,
  PAYOS_API_KEY: process.env.PAYOS_API_KEY,
  PAYOS_CHECKSUM_KEY: process.env.PAYOS_CHECKSUM_KEY,
});


// ===== CORS =====
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options("*", cors());

// ===== BODY PARSER =====
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// ===== COOKIE =====
app.use(cookieParser());

// ===== STATIC UPLOAD =====
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ===== ROUTES =====
initWebRoutes(app);

// ✅ PAYOS (create + webhook)
payosRoute(app);

// ✅ inventory admin
app.use(
  "/api/admin/inventory",
  jwtAction.checkUserJWT,
  checkUserPermission({
    getPath: (req) => {
      const fullPath = `${req.baseUrl}${req.path}`;
      return fullPath.replace(/^\/api\/admin/, "/admin");
    },
  }),
  adminInventoryApi
);

// ✅ auth
authRoute(app);

// ✅ trainer routes
if (trainerRoutes) {
  app.use(
    "/api/pt",
    jwtAction.checkUserJWT,
    checkUserPermission({
      getPath: (req) => {
        const fullPath = `${req.baseUrl}${req.path}`;
        return fullPath.replace(/^\/api\/pt/, "/trainer");
      },
    }),
    trainerRoutes
  );

  app.use(
    "/pt",
    jwtAction.checkUserJWT,
    checkUserPermission({
      getPath: (req) => {
        const fullPath = `${req.baseUrl}${req.path}`;
        return fullPath.replace(/^\/pt/, "/trainer");
      },
    }),
    trainerRoutes
  );
}

// ✅ common api
useApi(app);

// optional
if (typeof gymRoute === "function") gymRoute(app);
if (typeof uploadRoute === "function") uploadRoute(app);

// ===== DB =====
connectDB();

// ===== START =====
app.listen(PORT, () => {
  console.log(`🚀 Server running at: http://${HOSTNAME}:${PORT}`);
});
