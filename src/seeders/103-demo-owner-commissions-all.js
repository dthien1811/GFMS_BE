'use strict';

module.exports = {
  up: async (queryInterface) => {
    const [periodRows] = await queryInterface.sequelize.query(
      "SELECT MAX(id) as maxId FROM payrollperiod"
    );
    const basePeriodId = Number(periodRows?.[0]?.maxId || 0);
    const paidPeriodId = basePeriodId + 1;
    const closedPeriodId = basePeriodId + 2;

    const [itemRows] = await queryInterface.sequelize.query(
      "SELECT MAX(id) as maxId FROM payrollitem"
    );
    const baseItemId = Number(itemRows?.[0]?.maxId || 0);

    await queryInterface.sequelize.query(
      "UPDATE gym SET ownerCommissionRate = 0.20000 WHERE id = 2"
    );

    await queryInterface.bulkInsert(
      "payrollperiod",
      [
        {
          id: paidPeriodId,
          gymId: 2,
          startDate: "2024-01-01",
          endDate: "2024-01-31",
          status: "paid",
          totalSessions: 2,
          totalAmount: 300000,
          createdBy: 1,
          paidAt: new Date("2024-02-05"),
          notes: "Kỳ lương demo đã chi trả",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: closedPeriodId,
          gymId: 2,
          startDate: "2024-02-01",
          endDate: "2024-02-29",
          status: "closed",
          totalSessions: 2,
          totalAmount: 260000,
          createdBy: 1,
          paidAt: null,
          notes: "Kỳ lương demo đã chốt",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      {}
    );

    await queryInterface.bulkInsert(
      "payrollitem",
      [
        {
          id: baseItemId + 1,
          periodId: paidPeriodId,
          trainerId: 1,
          totalSessions: 2,
          totalAmount: 300000,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: baseItemId + 2,
          periodId: closedPeriodId,
          trainerId: 1,
          totalSessions: 2,
          totalAmount: 260000,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      {}
    );

    await queryInterface.bulkInsert(
      "commission",
      [
        // paid
        {
          trainerId: 1,
          bookingId: null,
          gymId: 2,
          activationId: null,
          payrollPeriodId: paidPeriodId,
          sessionDate: new Date("2024-01-05"),
          sessionValue: 187500,
          commissionRate: 0.8,
          commissionAmount: 150000,
          status: "paid",
          calculatedAt: new Date("2024-02-01"),
          paidAt: new Date("2024-02-05"),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          trainerId: 1,
          bookingId: null,
          gymId: 2,
          activationId: null,
          payrollPeriodId: paidPeriodId,
          sessionDate: new Date("2024-01-12"),
          sessionValue: 187500,
          commissionRate: 0.8,
          commissionAmount: 150000,
          status: "paid",
          calculatedAt: new Date("2024-02-01"),
          paidAt: new Date("2024-02-05"),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        // calculated
        {
          trainerId: 1,
          bookingId: null,
          gymId: 2,
          activationId: null,
          payrollPeriodId: closedPeriodId,
          sessionDate: new Date("2024-02-10"),
          sessionValue: 162500,
          commissionRate: 0.8,
          commissionAmount: 130000,
          status: "calculated",
          calculatedAt: new Date("2024-03-01"),
          paidAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          trainerId: 1,
          bookingId: null,
          gymId: 2,
          activationId: null,
          payrollPeriodId: closedPeriodId,
          sessionDate: new Date("2024-02-18"),
          sessionValue: 162500,
          commissionRate: 0.8,
          commissionAmount: 130000,
          status: "calculated",
          calculatedAt: new Date("2024-03-01"),
          paidAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        // pending
        {
          trainerId: 1,
          bookingId: null,
          gymId: 2,
          activationId: null,
          payrollPeriodId: null,
          sessionDate: new Date("2024-03-05"),
          sessionValue: 200000,
          commissionRate: 0.8,
          commissionAmount: 160000,
          status: "pending",
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
          sessionDate: new Date("2024-03-12"),
          sessionValue: 200000,
          commissionRate: 0.8,
          commissionAmount: 160000,
          status: "pending",
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
          sessionDate: new Date("2024-03-20"),
          sessionValue: 200000,
          commissionRate: 0.8,
          commissionAmount: 160000,
          status: "pending",
          calculatedAt: null,
          paidAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      {}
    );
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete("commission", null, {});
    await queryInterface.bulkDelete("payrollitem", null, {});
    await queryInterface.bulkDelete("payrollperiod", null, {});
    await queryInterface.sequelize.query(
      "UPDATE gym SET ownerCommissionRate = NULL WHERE id = 2"
    );
  },
};
