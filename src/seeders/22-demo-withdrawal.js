'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('withdrawal', [ // SỐ ÍT
      {
        trainerId: 1,
        amount: 5000000,
        withdrawalMethod: 'bank_transfer',
        accountInfo: 'Vietcombank - 1234567890 - John Trainer',
        status: 'completed',
        processedBy: 2,
        processedDate: new Date('2024-02-05'),
        notes: 'Monthly commission payout',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('withdrawal', null, {}); // SỐ ÍT
  }
};