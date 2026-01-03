'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('PackageActivation', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      memberId: { type: Sequelize.INTEGER }, // NO FK TEMP
      packageId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Package', key: 'id' }
      },
      transactionId: { type: Sequelize.INTEGER }, // NO FK TEMP
      activationDate: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      expiryDate: { type: Sequelize.DATE },
      totalSessions: { type: Sequelize.INTEGER },
      sessionsUsed: { type: Sequelize.INTEGER, defaultValue: 0 },
      sessionsRemaining: { type: Sequelize.INTEGER },
      pricePerSession: { type: Sequelize.DECIMAL(10, 2) },
      status: { 
        type: Sequelize.ENUM('active', 'expired', 'cancelled', 'completed'),
        defaultValue: 'active'
      },
      notes: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('PackageActivation');
  }
};