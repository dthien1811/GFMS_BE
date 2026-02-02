const express = require('express');
const router = express.Router();
const trainerController = require('../controllers/trainerController');
const trainerShareController = require("../controllers/trainerShareController");
const trainerPackageController = require("../controllers/trainerPackageController");
const trainerRequestController = require("../controllers/trainerRequestController");


router.get('/me', trainerController.getMyTrainerProfile);

// Endpoint: Xem danh sách PT
router.get('/', trainerController.getTrainers);

// Endpoint: Tạo hồ sơ PT mới
router.post('/', trainerController.createTrainer);

router.post("/share-requests", trainerShareController.createShareRequest);
router.get("/share-requests", trainerShareController.getMyShareRequests);


// Endpoint: Cập nhật thông tin PT
router.put('/:id', trainerController.updateTrainer);

// Endpoint: Xem lịch làm việc PT
router.get('/:id/schedule', trainerController.getTrainerSchedule);

// Endpoint: Cập nhật lịch rảnh của PT
router.put('/:id/schedule', trainerController.updateTrainerSchedule);

// Endpoint: Xem hồ sơ PT chi tiết
router.get('/:id/details', trainerController.getTrainerDetails);

// Endpoint: Cập nhật kỹ năng/chứng chỉ PT
router.put('/:id/skills', trainerController.updateTrainerSkills);

router.get("/packages/me", trainerPackageController.getMyPackages);
router.post("/packages", trainerPackageController.createPackage);
router.put("/packages/:id", trainerPackageController.updatePackage);
router.patch("/packages/:id/toggle", trainerPackageController.togglePackage);

// ===== Trainer Requests (UC-REQ) =====
router.post("/requests/leave", trainerRequestController.createLeaveRequest);
router.post("/requests/shift-change", trainerRequestController.createShiftChangeRequest);
router.post("/requests/transfer-branch", trainerRequestController.createTransferBranchRequest);
router.post("/requests/overtime", trainerRequestController.createOvertimeRequest);

router.get("/requests", trainerRequestController.getMyRequests);
router.patch("/requests/:id/cancel", trainerRequestController.cancelRequest);


module.exports = router;
