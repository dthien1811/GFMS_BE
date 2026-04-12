
const express = require('express');
const router = express.Router();
const jwtAction = require('../../middleware/JWTAction');
const { requireGroupName } = require('../../middleware/role');
const requestController = require('../../controllers/owner/request.controller');

// Trùng các nhóm owner trên route khác — tránh 403 khi Group.name là "Gym Owner"/"Owner"/…
const OWNER_APPROVAL_GROUPS = [
  "owner",
  "Owner",
  "Gym Owner",
  "Gym Owners",
  "Owners",
  "Administrators",
];

// Đảm bảo các route gọi đúng controller function
router.get(
  '/requests',
  jwtAction.checkUserJWT,
  requireGroupName(OWNER_APPROVAL_GROUPS),
  requestController.getRequests
);  // Đúng function và đúng đường dẫn

router.patch(
  '/requests/:id/approve',
  jwtAction.checkUserJWT,
  requireGroupName(OWNER_APPROVAL_GROUPS),
  requestController.approveRequest
);   // Duyệt yêu cầu
router.patch(
  '/requests/:id/reject',
  jwtAction.checkUserJWT,
  requireGroupName(OWNER_APPROVAL_GROUPS),
  requestController.rejectRequest
);  // Từ chối yêu cầu

module.exports = router;