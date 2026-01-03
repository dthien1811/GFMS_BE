'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('ProjectUser', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      projectId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Project', key: 'id' } // SỐ ÍT
      },
      userId: { 
        type: Sequelize.INTEGER,
        references: { model: 'User', key: 'id' } // SỐ ÍT
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('ProjectUser'); // SỐ ÍT
  }
};