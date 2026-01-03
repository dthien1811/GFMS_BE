/**
 * API routes for admin/user CRUD
 */
import express from "express";
import useApiController from "../controllers/useApiController";

let router = express.Router();

let useApi = (app) => {
  // Users (UC-USER-13..16)
  router.get("/users", useApiController.readUsers);
  router.post("/users", useApiController.createUser);
  router.put("/users/:id", useApiController.updateUser);
  router.delete("/users/:id", useApiController.deleteUser);

  // Groups (for dropdown)
  router.get("/groups", useApiController.readGroups);

  // Prefix
  return app.use("/api", router);
};

module.exports = useApi;
