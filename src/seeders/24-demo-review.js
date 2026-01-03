'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Review', [ // SỐ ÍT
      {
        memberId: 1,
        trainerId: 1,
        bookingId: 1,
        rating: 5,
        comment: 'John is an excellent trainer! Very professional and knowledgeable.',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Review', null, {}); // SỐ ÍT
  }
};