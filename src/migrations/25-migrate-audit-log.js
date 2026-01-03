'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('AuditLog', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { 
        type: Sequelize.INTEGER,
        references: { model: 'User', key: 'id' } // SỐ ÍT
      },
      action: { type: Sequelize.STRING },
      tableName: { type: Sequelize.STRING },
      recordId: { type: Sequelize.INTEGER },
      oldValues: { type: Sequelize.JSON },
      newValues: { type: Sequelize.JSON },
      ipAddress: { type: Sequelize.STRING },
      userAgent: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('AuditLog'); // SỐ ÍT
  }
};