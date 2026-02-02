import express from "express";
import ownerBookingController from "../../controllers/owner/booking.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

router.get("/", ownerBookingController.getMyBookings);
router.post("/", ownerBookingController.createBooking);
router.get("/trainer/:trainerId/schedule", ownerBookingController.getTrainerSchedule);
router.patch("/:id/status", ownerBookingController.updateBookingStatus);
router.get("/:id", ownerBookingController.getBookingDetail);
router.put("/:id", ownerBookingController.updateBooking);
router.delete("/:id/cancel", ownerBookingController.cancelBooking);

export default router;
