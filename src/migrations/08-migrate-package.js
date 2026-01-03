'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Package', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING },
      description: { type: Sequelize.TEXT },
      type: { type: Sequelize.STRING },
      durationDays: { type: Sequelize.INTEGER },
      price: { type: Sequelize.DECIMAL(10, 2) },
      sessions: { type: Sequelize.INTEGER },
      gymId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Gym', key: 'id' } // SỐ ÍT
      },
      status: { type: Sequelize.STRING },
      // ========== THÊM MỚI ==========
      pricePerSession: { type: Sequelize.DECIMAL(10, 2) },
      commissionRate: { type: Sequelize.FLOAT, defaultValue: 0.6 },
      isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
      validityType: { 
        type: Sequelize.ENUM('days', 'months', 'sessions'), 
        defaultValue: 'months' 
      },
      maxSessionsPerWeek: { type: Sequelize.INTEGER },
      // ==============================
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Package'); // SỐ ÍT
  }
};