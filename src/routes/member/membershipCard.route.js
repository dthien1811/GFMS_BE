import express from "express";
import { requireGroupName } from "../../middleware/role";
import membershipCardController from "../../controllers/member/membershipCard.controller";

const router = express.Router();

router.use(requireGroupName(["Members", "Member"]));

router.get("/plans", membershipCardController.listPlans);
router.get("/me", membershipCardController.myCurrentCard);
router.post("/purchase", membershipCardController.purchase);

export default router;
