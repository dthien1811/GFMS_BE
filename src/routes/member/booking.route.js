import express from "express";
import bookingController from "../../controllers/member/booking.controller";

const router = express.Router();

// ✅ MEMBER = groupId 4
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

// booking flow
router.get("/trainers", bookingController.getAvailableTrainers);
router.get("/slots", bookingController.getAvailableSlots);
router.post("/", bookingController.createBooking);
router.get("/", bookingController.getMyBookings);

export default router;
