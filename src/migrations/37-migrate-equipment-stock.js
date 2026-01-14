'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('equipmentstock', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      equipmentId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'equipment',
          key: 'id'
        },
        allowNull: false
      },
      gymId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'gym',
          key: 'id'
        },
        allowNull: false
      },
      quantity: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      reservedQuantity: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      availableQuantity: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      location: {
        type: Sequelize.STRING
      },
      reorderPoint: {
        type: Sequelize.INTEGER,
        defaultValue: 10
      },
      lastRestocked: {
        type: Sequelize.DATE
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

    // Add unique constraint for equipmentId and gymId
    await queryInterface.addIndex('equipmentstock', ['equipmentId', 'gymId'], {
      unique: true,
      name: 'equipment_stock_unique'
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('equipmentstock');
  }
};