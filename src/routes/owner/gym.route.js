import express from "express";
import ownerGymController from "../../controllers/owner/gym.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

// (tuỳ) nếu useApi đã checkUserJWT rồi thì đoạn này có thể bỏ,
// nhưng để lại cũng không sao (chạy 2 lần)
router.use(jwtAction.checkUserJWT);

// chỉ owner
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

router.get("/", ownerGymController.getMyGyms);

export default router;
