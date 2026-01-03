'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Commission', [ // SỐ ÍT
      {
        trainerId: 1,
        bookingId: 1,
        gymId: 1,
        activationId: 1,
        sessionDate: new Date('2024-02-15'),
        sessionValue: 833333.33,
        commissionRate: 0.6,
        commissionAmount: 500000,
        status: 'paid',
        calculatedAt: new Date('2024-02-16'),
        paidAt: new Date('2024-02-20'),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Commission', null, {}); // SỐ ÍT
  }
};