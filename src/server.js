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

// Nếu file route này là CommonJS
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

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;
const HOSTNAME = process.env.HOSTNAME || "localhost";

// ===== CORS (chuẩn cho cookie JWT) =====
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

// ✅ payOS webhook / payment routes (không cần JWT)
payosRoute(app);

// ✅ inventory admin (JWT + permission)
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

if (trainerRoutes) {
  // ✅ Trainer API: siết JWT + permission và map /api/pt -> /trainer
  app.use(
    "/api/pt",
    jwtAction.checkUserJWT,
    checkUserPermission({
      getPath: (req) => {
        const fullPath = `${req.baseUrl}${req.path}`; // /api/pt/me
        return fullPath.replace(/^\/api\/pt/, "/trainer"); // /trainer/me
      },
    }),
    trainerRoutes
  );

  // (optional) nếu bạn vẫn giữ route /pt cho test/dev thì cũng map tương tự
  app.use(
    "/pt",
    jwtAction.checkUserJWT,
    checkUserPermission({
      getPath: (req) => {
        const fullPath = `${req.baseUrl}${req.path}`; // /pt/me
        return fullPath.replace(/^\/pt/, "/trainer");  // /trainer/me
      },
    }),
    trainerRoutes
  );
}

// ✅ admin/user CRUD (api chung)
useApi(app);




if (typeof gymRoute === "function") gymRoute(app);
if (typeof uploadRoute === "function") uploadRoute(app);

// ===== DB CONNECT =====
connectDB();

app.listen(PORT, () => {
  console.log(`Server running at: http://${HOSTNAME}:${PORT}`);
});
