'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('PackageActivation', [ // SỐ ÍT
      {
        memberId: 1,
        packageId: 1,
        transactionId: null,
        activationDate: new Date('2024-01-20'),
        expiryDate: new Date('2024-04-20'),
        totalSessions: 12,
        sessionsUsed: 1,
        sessionsRemaining: 11,
        pricePerSession: 833333.33,
        status: 'active',
        notes: 'Premium package activation',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('PackageActivation', null, {}); // SỐ ÍT
  }
};