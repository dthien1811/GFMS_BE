'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('TrainerShare', [ // SỐ ÍT
      {
        trainerId: 1,
        fromGymId: 1,
        toGymId: 2,
        shareType: 'temporary',
        startDate: new Date('2024-03-01'),
        endDate: new Date('2024-03-31'),
        commissionSplit: 0.7,
        status: 'approved',
        requestedBy: 2,
        approvedBy: 1,
        notes: 'Temporary share for March month',
        policyId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('TrainerShare', null, {}); // SỐ ÍT
  }
};