// routes/web.js
import express from "express";
import hompageController from "../controllers/homepageController";

let router = express.Router();

const initWebRoutes = (app) => {
  router.get('/', hompageController.handleHelloword);
  router.get('/user', hompageController.handleUserPage);
  router.post('/create', hompageController.handleCreateUser);
  router.post("/delete-user/:id", hompageController.handleDeleteUser)
  router.get("/update-user/:id", hompageController.getUpdateUserPage)
  router.post("/user/update-user", hompageController.handleUpdateUser)

  return app.use('/test', router);
};

export default initWebRoutes;
