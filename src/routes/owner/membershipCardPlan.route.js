import express from "express";
import { requireGroupName } from "../../middleware/role";
import controller from "../../controllers/owner/membershipCardPlan.controller";

const router = express.Router();

router.use(requireGroupName(["Gym Owners"]));

router.get("/", controller.list);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.patch("/:id/toggle", controller.toggle);

export default router;
