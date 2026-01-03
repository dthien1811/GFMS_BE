'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Withdrawal', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      trainerId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Trainer', key: 'id' } // SỐ ÍT
      },
      amount: { type: Sequelize.DECIMAL(10, 2) },
      withdrawalMethod: { type: Sequelize.STRING },
      accountInfo: { type: Sequelize.TEXT },
      status: { type: Sequelize.STRING },
      processedBy: { 
        type: Sequelize.INTEGER,
        references: { model: 'User', key: 'id' } // SỐ ÍT
      },
      processedDate: { type: Sequelize.DATE },
      notes: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Withdrawal'); // SỐ ÍT
  }
};