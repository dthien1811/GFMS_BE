import express from 'express';
import bodyParser from 'body-parser';
import viewEngine from './config/viewEngine';
import initWebRoutes from './routes/web';
import authRoute from './routes/auth';
import useApi from './routes/useApi';
import connection from './config/connectDB';
import cors from 'cors';

require('dotenv').config();
// Add headers before the routes are defined


let app = express();

app.use(cors({
  origin: "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ⚠️ RẤT QUAN TRỌNG: xử lý preflight
app.options("*", cors());
//config view engine
viewEngine(app);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const HOSTNAME = process.env.HOSTNAME || "localhost";
let PORT = process.env.PORT || 8080;


//init all web routes
initWebRoutes(app);
authRoute(app);
useApi(app);
//init all web routes
connection();
app.listen(PORT, () => {
     console.log(`Server running at: http://${HOSTNAME}:${PORT}`);
})