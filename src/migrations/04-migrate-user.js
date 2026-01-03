'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('User', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      password: { type: Sequelize.STRING, allowNull: false },
      username: { type: Sequelize.STRING, allowNull: false, unique: true },
      address: { type: Sequelize.STRING },
      sex: { type: Sequelize.ENUM('male', 'female', 'other'), defaultValue: 'male' },
      phone: { type: Sequelize.STRING },
      groupId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Group', key: 'id' } // SỐ ÍT
      },
      avatar: { type: Sequelize.STRING, defaultValue: 'default-avatar.png' },
      status: { type: Sequelize.ENUM('active', 'inactive', 'suspended'), defaultValue: 'active' },
      lastLogin: { type: Sequelize.DATE },
      emailVerified: { type: Sequelize.BOOLEAN, defaultValue: false },
      resetPasswordToken: { type: Sequelize.STRING },
      resetPasswordExpires: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('User'); // SỐ ÍT
  }
};