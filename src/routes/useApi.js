// routes/useApi.js
import express from "express";
import useApiController from "../controllers/useApiController";

import ownerPackageRoute from "./owner/package.route";
import ownerPolicyRoute from "./owner/policy.route";
import ownerGymRoute from "./owner/gym.route";
import ownerMaintenanceRoute from "./owner/maintenance.route";
import ownerEquipmentRoute from "./owner/equipment.route";
import ownerInventoryRoute from "./owner/inventory.route";
import ownerTransferRoute from "./owner/transfer.route";
import ownerPurchaseRoute from "./owner/purchase.route";
import ownerFranchiseRoute from "./owner/franchise.route";
import ownerTrainerShareRoute from "./owner/trainershare.route";
import ownerMemberRoute from "./owner/member.route";
import ownerBookingRoute from "./owner/booking.route";
import ownerTrainerRoute from "./owner/trainer.route";
import memberBookingRoute from "./member/booking.route";
import memberPackageRoute from "./member/package.route";
import memberMyPackagesRoute from "./member/myPackages.route";
import trainerRoute from "./trainer";

import jwtAction from "../middleware/JWTAction";
import { checkUserPermission } from "../middleware/permission";

const router = express.Router();

const useApi = (app) => {
  // ✅ all /api must login
  router.use(jwtAction.checkUserJWT);

  // ✅ mount business routes FIRST (owner/member tự kiểm role bằng requireGroupName)
  router.use("/owner/packages", ownerPackageRoute);
  router.use("/owner/policies", ownerPolicyRoute);
  router.use("/owner/gyms", ownerGymRoute);
  router.use("/owner/maintenances", ownerMaintenanceRoute);
  router.use("/owner/equipment", ownerEquipmentRoute);
  router.use("/owner/inventory", ownerInventoryRoute);
  router.use("/owner/transfers", ownerTransferRoute);
  router.use("/owner/purchases", ownerPurchaseRoute);
  router.use("/owner/franchise-requests", ownerFranchiseRoute);
  router.use("/owner/trainer-shares", ownerTrainerShareRoute);
  router.use("/owner/members", ownerMemberRoute);
  router.use("/owner/bookings", ownerBookingRoute);
  router.use("/owner/trainers", ownerTrainerRoute);

  router.use("/member/bookings", memberBookingRoute);
  router.use("/member/packages", memberPackageRoute);
  router.use("/member/my-packages", memberMyPackagesRoute);

  // trainer route (public for owner to select)
  router.use("/trainer", trainerRoute);

  // ✅ admin permission only (users/groups…)
  /*router.use(
    checkUserPermission({
      getPath: (req) => {
        const fullPath = `${req.baseUrl}${req.path}`; // /api/users
        // map admin resources
        return fullPath.replace(/^\/api/, "/admin");
      },
    })
  );*/
   router.use(
  ["/users", "/groups"],
  checkUserPermission({
    getPath: (req) => {
      // dùng originalUrl để ra đúng /api/users... rồi map sang /admin/users...
      const raw = (req.originalUrl || "").split("?")[0]; // /api/users
      return raw.replace(/^\/api/, "/admin");            // /admin/users
    },
  })
);


  // admin APIs
  router.get("/users", useApiController.readUsers);
  router.post("/users", useApiController.createUser);
  router.put("/users/:id", useApiController.updateUser);
  router.delete("/users/:id", useApiController.deleteUser);
  router.get("/groups", useApiController.readGroups);

  return app.use("/api", router);
};

export default useApi;
