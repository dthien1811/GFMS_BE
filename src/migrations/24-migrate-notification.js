'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Notification', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { 
        type: Sequelize.INTEGER,
        references: { model: 'User', key: 'id' } // SỐ ÍT
      },
      title: { type: Sequelize.STRING },
      message: { type: Sequelize.TEXT },
      notificationType: { type: Sequelize.STRING },
      relatedId: { type: Sequelize.INTEGER },
      relatedType: { type: Sequelize.STRING },
      isRead: { type: Sequelize.BOOLEAN, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Notification'); // SỐ ÍT
  }
};