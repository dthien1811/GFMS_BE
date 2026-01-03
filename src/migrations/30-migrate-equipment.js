'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Equipment', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      code: {
        type: Sequelize.STRING,
        unique: true
      },
      description: {
        type: Sequelize.TEXT
      },
      categoryId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'EquipmentCategory',
          key: 'id'
        }
      },
      brand: {
        type: Sequelize.STRING
      },
      model: {
        type: Sequelize.STRING
      },
      specifications: {
        type: Sequelize.JSON
      },
      unit: {
        type: Sequelize.STRING,
        defaultValue: 'piece'
      },
      minStockLevel: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      maxStockLevel: {
        type: Sequelize.INTEGER
      },
      status: {
        type: Sequelize.ENUM('active', 'discontinued'),
        defaultValue: 'active'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Equipment');
  }
};