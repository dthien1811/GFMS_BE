import express from "express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";

import initWebRoutes from "./routes/web";
import authRoute from "./routes/auth";
import useApi from "./routes/useApi";
import adminInventoryApi from "./routes/adminInventoryApi";
import connection from "./config/connectDB";

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;
const HOSTNAME = process.env.HOSTNAME || "localhost";

app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

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

// routes
initWebRoutes(app);
adminInventoryApi(app);
authRoute(app);
useApi(app);

// DB connect
connection();

app.listen(PORT, () => {
  console.log(`Server running at: http://${HOSTNAME}:${PORT}`);
});
