import express from "express";
import bookingController from "../../controllers/member/booking.controller";
import verifyToken from "../../middleware/auth";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(verifyToken, requireGroupName(["Members", "Member"]));

router.get("/trainers", bookingController.getAvailableTrainers);
router.get("/slots", bookingController.getAvailableSlots);

router.post("/", bookingController.createBooking);

router.get("/", bookingController.getMyBookings);

router.patch("/:id/cancel", bookingController.cancelBooking);

router.post("/:id/checkin", bookingController.checkinBooking);

router.post("/:id/checkout", bookingController.checkoutBooking);

export default router;
