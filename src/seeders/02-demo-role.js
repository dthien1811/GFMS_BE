'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Role', [ // SỐ ÍT
      {
        url: '/admin/dashboard',
        description: 'Access admins dashboard',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        url: '/owner/dashboard',
        description: 'Access owner dashboard',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        url: '/trainer/dashboard',
        description: 'Access trainer dashboard',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        url: '/member/dashboard',
        description: 'Access member dashboard',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Role', null, {}); // SỐ ÍT
  }
};