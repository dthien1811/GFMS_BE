'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('grouprole', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      groupId: { 
        type: Sequelize.INTEGER,
        references: { model: 'group', key: 'id' } // SỐ ÍT
      },
      roleId: { 
        type: Sequelize.INTEGER,
        references: { model: 'role', key: 'id' } // SỐ ÍT
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('grouprole'); // SỐ ÍT
  }
};