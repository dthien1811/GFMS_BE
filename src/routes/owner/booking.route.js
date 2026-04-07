import express from "express";
import ownerBookingController from "../../controllers/owner/booking.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

router.get("/", ownerBookingController.getMyBookings);
router.get("/trainer/:trainerId/schedule", ownerBookingController.getTrainerSchedule);

export default router;
