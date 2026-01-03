'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Project', [ // SỐ ÍT
      {
        name: 'GFMS Development',
        description: 'Gym Franchise Management System',
        startDate: '2024-01-15',
        customerId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Project', null, {}); // SỐ ÍT
  }
};