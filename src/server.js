import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer } from "http";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import path from "path";
import cors from "cors";

import initWebRoutes from "./routes/web";
import authRoute from "./routes/auth";
import useApi from "./routes/useApi";
import payosRoute from "./routes/payment/payos.route";

import connectDB from "./config/connectDB";
import { initSocket } from "./socket";

import jwtAction from "./middleware/JWTAction";
import { checkUserPermission } from "./middleware/permission";

import marketplaceRoute from "./routes/marketplace/marketplace.route";

// CommonJS routes (support both CJS + ESM default export)
let adminInventoryApi = require("./routes/adminInventoryApi");
adminInventoryApi = adminInventoryApi.default || adminInventoryApi;

// ✅ NEW: public signing API (NO JWT)
let publicFranchiseContractApi = require("./routes/publicFranchiseContractApi");
publicFranchiseContractApi = publicFranchiseContractApi.default || publicFranchiseContractApi;

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
} catch (e) {
  console.error("❌ Failed to load ./routes/trainer:", e);
}

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 8080;
const HOSTNAME = process.env.HOSTNAME || "localhost";

// ✅ Enterprise deploy (Render/NGINX): trust proxy để lấy đúng req.ip / x-forwarded-for
app.set("trust proxy", 1);

// ===== CORS =====
// Nếu bạn muốn flexible: đặt FRONTEND_URL trong .env
// NOTE (PDF preview): Chrome built-in PDF Viewer (chrome-extension://...) thường fetch PDF bằng XHR/fetch
// và sẽ bị chặn nếu server chỉ allow đúng 1 origin. Vì vậy ta allow thêm chrome-extension:// và các origin null.
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const corsOptions = {
  origin: (origin, cb) => {
    // origin có thể null (file://, some embeds) hoặc chrome-extension:// (Chrome PDF Viewer)
    if (!origin) return cb(null, true);

    const o = String(origin);
    if (o === FRONTEND_URL) return cb(null, true);

    // allow localhost variants in dev
    if (FRONTEND_URL.includes("localhost") && /^https?:\/\/localhost:\\d+$/i.test(o)) return cb(null, true);
    if (FRONTEND_URL.includes("127.0.0.1") && /^https?:\/\/127\\.0\\.0\\.1:\\d+$/i.test(o)) return cb(null, true);

    // ✅ allow Chrome PDF Viewer
    if (o.startsWith("chrome-extension://")) return cb(null, true);

    // default: only allow configured FE
    return cb(null, false);
  },
  credentials: true,
  // Chrome PDF viewer / PDF.js thường gửi Range request để tải PDF theo từng phần.
  // Nếu không allow/ expose Range + Content-Range thì sẽ rất dễ gặp lỗi
  // "Failed to load PDF document" khi preview PDF (đặc biệt trong iframe).
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: ["Content-Type", "Authorization", "Range"],
  exposedHeaders: [
    "Accept-Ranges",
    "Content-Length",
    "Content-Range",
    "Content-Type",
    "Content-Disposition",
    "ETag",
    "Last-Modified",
  ],
};

app.use(cors(corsOptions));
// Preflight
app.options("*", cors(corsOptions));

// ===== BODY PARSER =====
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// ===== COOKIE =====
app.use(cookieParser());

// ===== API STATUS LOG (minimal) =====
app.use((req, res, next) => {
  const targets = [
    "/api/owner/transactions",
    "/api/owner/commissions",
    "/api/owner/withdrawals",
    "/api/pt/me/commissions",
    "/api/pt/me/payroll-periods",
    "/api/pt/me/withdrawals",
    "/api/pt/me/wallet-summary",
  ];

  const isTarget = targets.some((p) => req.path.startsWith(p));
  if (!isTarget) return next();

  res.on("finish", () => {
    const status = res.statusCode;
    const tag = status >= 400 ? "ERR" : "OK";
    console.log(`[${tag}] ${req.method} ${req.path} -> ${status}`);
  });
  next();
});

// ===== STATIC UPLOAD =====
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ===== MARKETPLACE ROUTE (public) =====
app.use("/api/marketplace", marketplaceRoute);

// ===== ✅ PUBLIC SIGNING API (NO JWT) =====
// Owner mở link /sign-contract?token=. → FE gọi xuống đây để load/sign
app.use("/api/public", publicFranchiseContractApi);

// ===== ROUTES =====
initWebRoutes(app);

// ✅ PAYOS (create + webhook)
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
initSocket(httpServer);

httpServer.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.error(`➡️  Fix nhanh (Windows): netstat -ano | findstr :${PORT}  (lấy PID) rồi taskkill /PID <PID> /F`);
    console.error(`➡️  Hoặc chạy BE với port khác: set PORT=8081 && npm start`);
    process.exit(1);
  }
  console.error("Server error:", err);
  process.exit(1);
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running at: http://${HOSTNAME}:${PORT}`);
});
