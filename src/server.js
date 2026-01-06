import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import viewEngine from './config/viewEngine';
import initWebRoutes from './routes/web';
import authRoute from './routes/auth';
import useApi from './routes/useApi';
import gymRoute from './routes/gym';
import uploadRoute from './routes/upload';
import connectDB from './config/connectDB';
import connection from './config/connectDB';
import cookieParser from 'cookie-parser';
require('dotenv').config();
// Add headers before the routes are defined


let app = express();

//config view engine
viewEngine(app);

// Increase body size limit to handle base64 images from FE
// (tăng lên 50mb vì chuỗi base64 có thể lớn)
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// serve static uploads (for gym images)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

const HOSTNAME = process.env.HOSTNAME || "localhost";
let PORT = process.env.PORT || 8080;


//CORS fixtable
app.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);

    // Pass to next layer of middleware
    next();
});
//CORS fixtable

//init all web routes
initWebRoutes(app);
authRoute(app);
useApi(app);
gymRoute(app);
uploadRoute(app);

//init all web routes
connection();
app.listen(PORT, () => {
     console.log(`Server running at: http://${HOSTNAME}:${PORT}`);
})