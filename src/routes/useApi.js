/**
 * API routes for admin/user CRUD
 */
import express from "express";
import useApiController from "../controllers/useApiController";

import jwtAction from "../middleware/JWTAction";
import { checkUserPermission } from "../middleware/permission";

let router = express.Router();

let useApi = (app) => {
  // ========================
  // ✅ PROTECT ALL /api ROUTES AS ADMIN AREA
  // ========================
  router.use(jwtAction.checkUserJWT);
  router.use(
    checkUserPermission({
      // map path thực tế: /api/...  => /admin/...
      getPath: (req) => {
        const fullPath = `${req.baseUrl}${req.path}`;
        return fullPath.replace(/^\/api/, "/admin");
      },
    })
  );

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
