import express from "express";
import bookingController from "../../controllers/member/booking.controller";

const router = express.Router();

const requireMember = (req, res, next) => {
  if (!req.user || req.user.groupId !== 4) {
    return res.status(403).json({
      EC: -1,
      EM: "Forbidden (member only)",
    });
  }
  next();
};

router.use(requireMember);

router.get("/trainers", bookingController.getAvailableTrainers);
router.get("/slots", bookingController.getAvailableSlots);

router.post("/fixed-plan/options", bookingController.getFixedPlanOptions);
router.post("/fixed-plan/confirm", bookingController.confirmFixedPlan);

router.post("/", bookingController.createBooking);
router.post("/week-pattern", bookingController.createWeekPatternBookings);
router.get("/", bookingController.getMyBookings);

export default router;