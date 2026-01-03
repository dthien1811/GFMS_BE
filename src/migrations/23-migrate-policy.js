'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Policy', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      policyType: { 
        type: Sequelize.ENUM('trainer_share', 'commission', 'cancellation', 'refund', 'membership') 
      },
      name: { type: Sequelize.STRING },
      description: { type: Sequelize.TEXT },
      value: { type: Sequelize.JSON },
      isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
      appliesTo: { type: Sequelize.ENUM('system', 'gym', 'trainer') },
      gymId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Gym', key: 'id' } // SỐ ÍT
      },
      effectiveFrom: { type: Sequelize.DATE },
      effectiveTo: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Policy'); // SỐ ÍT
  }
};