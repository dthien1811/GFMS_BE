// routes/useApi.js
import express from "express";
import useApiController from "../controllers/useApiController";

import ownerPackageRoute from "./owner/package.route";
import memberBookingRoute from "./member/booking.route";
import memberPackageRoute from "./member/package.route";
import memberMyPackagesRoute from "./member/myPackages.route";

import jwtAction from "../middleware/JWTAction";
import { checkUserPermission } from "../middleware/permission";

const router = express.Router();

const useApi = (app) => {
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

  // ========================
  // ✅ MOUNT SUB-ROUTES
  // ========================
  router.use("/owner/packages", ownerPackageRoute);
  router.use("/member/bookings", memberBookingRoute);
  router.use("/member/packages", memberPackageRoute);
  router.use("/member/my-packages", memberMyPackagesRoute);

  // ========================
  // ✅ Users (UC-USER-13..16)
  // ========================
  router.get("/users", useApiController.readUsers);
  router.post("/users", useApiController.createUser);
  router.put("/users/:id", useApiController.updateUser);
  router.delete("/users/:id", useApiController.deleteUser);

  router.get("/groups", useApiController.readGroups);

  return app.use("/api", router);
};

export default useApi;
