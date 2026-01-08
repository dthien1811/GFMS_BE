import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import viewEngine from './config/viewEngine';
import initWebRoutes from './routes/web';
import authRoute from './routes/auth';
import useApi from './routes/useApi';
import connection from './config/connectDB';
import cors from 'cors';
import gymRoute from './routes/gym';
import uploadRoute from './routes/upload';
import connectDB from './config/connectDB';
import connection from './config/connectDB';
import cookieParser from 'cookie-parser';

require('dotenv').config();
// Add headers before the routes are defined
const trainerRoutes = require('./routes/trainer');

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

// Increase body size limit to handle base64 images from FE
// (tăng lên 50mb vì chuỗi base64 có thể lớn)
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// serve static uploads (for gym images)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

const HOSTNAME = process.env.HOSTNAME || "localhost";
let PORT = process.env.PORT || 8080;


//init all web routes
initWebRoutes(app);
authRoute(app);
useApi(app);

app.use('/api/pt', trainerRoutes);
app.use('/pt', trainerRoutes);

gymRoute(app);
uploadRoute(app);

//init all web routes
connection();
app.listen(PORT, () => {
     console.log(`Server running at: http://${HOSTNAME}:${PORT}`);
})