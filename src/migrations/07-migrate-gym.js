'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Gym', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING },
      address: { type: Sequelize.STRING },
      phone: { type: Sequelize.STRING },
      email: { type: Sequelize.STRING },
      description: { type: Sequelize.TEXT },
      status: { type: Sequelize.STRING },
      ownerId: { 
        type: Sequelize.INTEGER,
        references: { model: 'User', key: 'id' } // Giữ lại vì User đã có
      },
      franchiseRequestId: { 
        type: Sequelize.INTEGER,
        // XÓA references TẠM THỜI, sẽ thêm trong file 27
        // references: { model: 'FranchiseRequest', key: 'id' }
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Gym');
  }
};