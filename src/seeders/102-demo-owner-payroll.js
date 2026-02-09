'use strict';

module.exports = {
  up: async (queryInterface) => {
    // Create a payroll period for gymId=2
    await queryInterface.bulkInsert('payrollperiod', [
      {
        id: 1,
        gymId: 2,
        startDate: '2024-02-01',
        endDate: '2024-02-29',
        status: 'closed',
        totalSessions: 2,
        totalAmount: 2550000,
        createdBy: 1,
        paidAt: null,
        notes: 'Kỳ lương demo tháng 02/2024',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ], {});

    await queryInterface.bulkInsert('payrollitem', [
      {
        periodId: 1,
        trainerId: 1,
        totalSessions: 2,
        totalAmount: 2550000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ], {});

    // Commission records: 2 calculated (in period), 2 pending (not yet closed)
    await queryInterface.bulkInsert('commission', [
      {
        trainerId: 1,
        bookingId: null,
        gymId: 2,
        activationId: null,
        payrollPeriodId: 1,
        sessionDate: new Date('2024-02-10'),
        sessionValue: 1500000 / 8,
        commissionRate: 0.85,
        commissionAmount: (1500000 / 8) * 0.85,
        status: 'calculated',
        calculatedAt: new Date('2024-03-01'),
        paidAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        trainerId: 1,
        bookingId: null,
        gymId: 2,
        activationId: null,
        payrollPeriodId: 1,
        sessionDate: new Date('2024-02-18'),
        sessionValue: 1500000 / 8,
        commissionRate: 0.85,
        commissionAmount: (1500000 / 8) * 0.85,
        status: 'calculated',
        calculatedAt: new Date('2024-03-01'),
        paidAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        trainerId: 1,
        bookingId: null,
        gymId: 2,
        activationId: null,
        payrollPeriodId: null,
        sessionDate: new Date('2024-03-05'),
        sessionValue: 1500000 / 8,
        commissionRate: 0.85,
        commissionAmount: (1500000 / 8) * 0.85,
        status: 'pending',
        calculatedAt: null,
        paidAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        trainerId: 1,
        bookingId: null,
        gymId: 2,
        activationId: null,
        payrollPeriodId: null,
        sessionDate: new Date('2024-03-12'),
        sessionValue: 1500000 / 8,
        commissionRate: 0.85,
        commissionAmount: (1500000 / 8) * 0.85,
        status: 'pending',
        calculatedAt: null,
        paidAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ], {});
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('commission', null, {});
    await queryInterface.bulkDelete('payrollitem', null, {});
    await queryInterface.bulkDelete('payrollperiod', null, {});
  },
};
