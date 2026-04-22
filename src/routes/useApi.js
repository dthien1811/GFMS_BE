import express from "express";
import useApiController from "../controllers/useApiController";

import ownerDashboardRoute from "./owner/dashboard.route";
import ownerPackageRoute from "./owner/package.route";
import ownerMembershipCardPlanRoute from "./owner/membershipCardPlan.route";
import ownerPolicyRoute from "./owner/policy.route";
import ownerGymRoute from "./owner/gym.route";
import ownerMaintenanceRoute from "./owner/maintenance.route";
import ownerEquipmentRoute from "./owner/equipment.route";
import ownerInventoryRoute from "./owner/inventory.route";
import ownerTransferRoute from "./owner/transfer.route";
import ownerPurchaseRoute from "./owner/purchase.route";
import ownerTransactionRoute from "./owner/transaction.route";
import ownerCommissionRoute from "./owner/commission.route";
import ownerWithdrawalRoute from "./owner/withdrawal.route";
import ownerFranchiseRoute from "./owner/franchise.route";
import ownerTrainerShareRoute from "./owner/trainershare.route";
import ownerMemberRoute from "./owner/member.route";
import ownerBookingRoute from "./owner/booking.route";
import ownerTrainerRoute from "./owner/trainer.route";
import ownerReviewRoute from "./owner/review.route";
import ownerNotificationRoute from "./owner/notification.route";

import memberBookingRoute from "./member/booking.route";
import memberPackageRoute from "./member/package.route";
import memberMyPackagesRoute from "./member/myPackages.route";
import memberMetricRoute from "./member/metric.route";
import memberProfileRoute from "./member/profile.route";
import memberMembershipCardRoute from "./member/membershipCard.route";

import memberMessageRoute from "./member/message.route";
import memberNotificationRoute from "./member/notification.route";
import adminNotificationRoute from "./admin/notification.route";
import memberReviewRoute from "./member/review.route";
import trainerMessageRoute from "./trainer/message.route";
import trainerNotificationRoute from "./trainer/notification.route";
import trainerShareRequestRoute from "./trainer/shareRequest.route";

import trainerRoute from "./trainer";

import jwtAction from "../middleware/JWTAction";
import { checkUserPermission } from "../middleware/permission";

const router = express.Router();

const useApi = (app) => {
  // ✅ all /api must login
  router.use(jwtAction.checkUserJWT);

  // ✅ mount business routes FIRST (owner/member tự check role)
  router.use("/owner/dashboard", ownerDashboardRoute);
  router.use("/owner/packages", ownerPackageRoute);
  router.use("/owner/membership-card-plans", ownerMembershipCardPlanRoute);
  router.use("/owner/policies", ownerPolicyRoute);
  router.use("/owner/gyms", ownerGymRoute);
  router.use("/owner/maintenances", ownerMaintenanceRoute);
  router.use("/owner/equipment", ownerEquipmentRoute);
  router.use("/owner/inventory", ownerInventoryRoute);
  router.use("/owner/transfers", ownerTransferRoute);
  router.use("/owner/purchases", ownerPurchaseRoute);
  router.use("/owner/transactions", ownerTransactionRoute);
  router.use("/owner/commissions", ownerCommissionRoute);
  router.use("/owner/withdrawals", ownerWithdrawalRoute);
  router.use("/owner/franchise-requests", ownerFranchiseRoute);
  router.use("/owner/trainer-shares", ownerTrainerShareRoute);
  router.use("/owner/members", ownerMemberRoute);
  router.use("/owner/bookings", ownerBookingRoute);
  router.use("/owner/trainers", ownerTrainerRoute);
  router.use("/owner/reviews", ownerReviewRoute);
  router.use("/owner/notifications", ownerNotificationRoute);

  router.use("/member/bookings", memberBookingRoute);
  router.use("/member/packages", memberPackageRoute);
  router.use("/member/my-packages", memberMyPackagesRoute);
  router.use("/member/metrics", memberMetricRoute);
  router.use("/member/profile", memberProfileRoute);
  router.use("/member/membership-cards", memberMembershipCardRoute);
  router.use("/member/reviews", memberReviewRoute);

  router.use("/member/messages", memberMessageRoute);
  router.use("/member/notifications", memberNotificationRoute);
  router.use("/admin/notifications", adminNotificationRoute);
  router.use("/trainer/messages", trainerMessageRoute);
  router.use("/trainer/notifications", trainerNotificationRoute);
  router.use("/trainer/share-requests", trainerShareRequestRoute);
  // trainer route
  router.use("/trainer", trainerRoute);

  // ✅ admin permission only (users/groups…)
  router.use(
    ["/users", "/groups"],
    checkUserPermission({
      getPath: (req) => {
        const raw = (req.originalUrl || "").split("?")[0];
        return raw.replace(/^\/api/, "/admin");
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