const express = require('express');
const router = express.Router();
const trainerController = require('../controllers/trainerController');

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

module.exports = router;
