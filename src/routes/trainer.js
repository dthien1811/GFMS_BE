const express = require('express');
const router = express.Router();
const trainerController = require('../controllers/trainerController');
const trainerRequestController = require("../controllers/trainerRequestController");
const trainerAttendanceController = require("../controllers/trainerAttendanceController");


router.get('/me', trainerController.getMyTrainerProfile);
router.get('/me/commissions', trainerController.getMyCommissions);
router.get('/me/payroll-periods', trainerController.getMyPayrollPeriods);
router.get('/me/payroll-periods/:periodId/commissions', trainerController.getMyPayrollPeriodCommissions);
router.get('/me/commissions/export', trainerController.exportMyCommissions);
router.get('/me/withdrawals', trainerController.getMyWithdrawals);
router.get('/me/wallet-summary', trainerController.getMyWalletSummary);
router.post('/me/withdrawals', trainerController.requestWithdrawal);

// Endpoint: Xem danh sách PT
router.get('/', trainerController.getTrainers);

// Endpoint: Tạo hồ sơ PT mới
router.post('/', trainerController.createTrainer);

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


// ===== Trainer Requests (UC-REQ) =====
router.post("/requests/leave", trainerRequestController.createLeaveRequest);
router.post("/requests/shift-change", trainerRequestController.createShiftChangeRequest);
router.post("/requests/transfer-branch", trainerRequestController.createTransferBranchRequest);
router.post("/requests/overtime", trainerRequestController.createOvertimeRequest);

router.get("/requests", trainerRequestController.getMyRequests);
router.patch("/requests/:id/cancel", trainerRequestController.cancelRequest);

router.get("/attendance/today", trainerAttendanceController.getToday);
router.post("/attendance/check-in", trainerAttendanceController.checkIn);
router.post("/attendance/check-out", trainerAttendanceController.checkOut);

module.exports = router;
