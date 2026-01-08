// routes/useApi.js
import express from "express";
import useApiController from "../controllers/useApiController";
import ownerPackageRoute from "./owner/package.route";
import memberBookingRoute from "./member/booking.route";
import memberPackageRoute from "./member/package.route";
import memberMyPackagesRoute from "./member/myPackages.route";

let router = express.Router();

const useApi = (app) => {
  app.use("/api/owner/packages", ownerPackageRoute);
  app.use("/api/member/bookings", memberBookingRoute);
  app.use("/api/member/packages", memberPackageRoute);
  app.use("/api/member/my-packages", memberMyPackagesRoute);
  router.get("/users", useApiController.readUsers);
  router.post("/users", useApiController.createUser);
  router.put("/users/:id", useApiController.updateUser);
  router.delete("/users/:id", useApiController.deleteUser);

  router.get("/groups", useApiController.readGroups);

  return app.use("/api", router);
};

export default useApi;
