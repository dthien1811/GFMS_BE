import express from "express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import path from "path";

import initWebRoutes from "./routes/web";
import authRoute from "./routes/auth";
import useApi from "./routes/useApi";
const adminInventoryApi = require("./routes/adminInventoryApi");

import jwtAction from "./middleware/JWTAction";
import { checkUserPermission } from "./middleware/permission";

import connection from "./config/connectDB";

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;
const HOSTNAME = process.env.HOSTNAME || "localhost";

app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// ✅ serve static uploads (NEW)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ===== CORS (NFR-REL) =====
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-Requested-With, Content-Type, Authorization, Accept"
  );
  res.setHeader("Access-Control-Allow-Credentials", true);

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// routes (web nháp - bạn nói kệ nó)
initWebRoutes(app);

// ✅ inventory admin (SIẾT Ở ĐÂY CHO CHẮC)
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

// ✅ admin/user CRUD
useApi(app);

// DB connect
connection();

app.listen(PORT, () => {
  console.log(`Server running at: http://${HOSTNAME}:${PORT}`);
});
