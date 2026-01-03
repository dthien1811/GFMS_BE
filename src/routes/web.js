/**
 * config all web routes
 */

import express from "express";
import hompageController from "../controllers/homepageController";
import authController from "../controllers/authController";

let router = express.Router();

let initWebRoutes = (app) => {
    router.get('/', hompageController.handleHelloword);
    router.get('/user', hompageController.handleUserPage);
    router.post('/create', hompageController.handleCreateUser);
    router.post("/delete-user/:id", hompageController.handleDeleteUser)
    router.get("/update-user/:id", hompageController.getUpdateUserPage)
    router.post("/user/update-user", hompageController.handleUpdateUser)

    return app.use('/test', router);
    //tiền tố
};

module.exports = initWebRoutes;
