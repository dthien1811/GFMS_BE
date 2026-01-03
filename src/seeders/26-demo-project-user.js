'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('ProjectUser', [ // SỐ ÍT
      {
        projectId: 1,
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('ProjectUser', null, {}); // SỐ ÍT
  }
};