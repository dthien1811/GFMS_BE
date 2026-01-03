'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('AuditLog', [ // SỐ ÍT
      {
        userId: 1,
        action: 'LOGIN',
        tableName: 'User',
        recordId: 1,
        oldValues: null,
        newValues: JSON.stringify({ lastLogin: new Date() }),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('AuditLog', null, {}); // SỐ ÍT
  }
};