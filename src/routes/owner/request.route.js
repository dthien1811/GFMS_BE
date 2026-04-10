
const express = require('express');
const router = express.Router();
const jwtAction = require('../../middleware/JWTAction');
const requestController = require('../../controllers/owner/request.controller');

// Đảm bảo các route gọi đúng controller function
router.get('/requests', jwtAction.checkUserJWT, requestController.getRequests);  // Đúng function và đúng đường dẫn

router.patch('/requests/:id/approve', jwtAction.checkUserJWT, requestController.approveRequest);   // Duyệt yêu cầu
router.patch('/requests/:id/reject', jwtAction.checkUserJWT, requestController.rejectRequest);  // Từ chối yêu cầu

module.exports = router;