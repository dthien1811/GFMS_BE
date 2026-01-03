'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Group', [ // SỐ ÍT
      {
        name: 'Administrators',
        description: 'System administrators with full access',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Gym Owners',
        description: 'Gym franchise owners',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Trainers',
        description: 'Personal trainers',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Members',
        description: 'Gym members',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Group', null, {}); // SỐ ÍT
  }
};