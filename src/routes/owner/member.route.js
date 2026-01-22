import express from "express";
import ownerMemberController from "../../controllers/owner/member.controller";
import jwtAction from "../../middleware/JWTAction";
import { requireGroupName } from "../../middleware/role";

const router = express.Router();

router.use(jwtAction.checkUserJWT);
router.use(requireGroupName(["owner", "Owner", "Gym Owner", "Gym Owners", "Owners"]));

router.get("/available-users", ownerMemberController.getAvailableUsers);
router.post("/", ownerMemberController.createMember);
router.get("/", ownerMemberController.getMyMembers);
router.get("/:id", ownerMemberController.getMemberDetail);
router.delete("/:id", ownerMemberController.deleteMember);

export default router;
