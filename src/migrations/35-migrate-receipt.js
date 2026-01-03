'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Receipt', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      code: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: false
      },
      purchaseOrderId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'PurchaseOrder',
          key: 'id'
        }
      },
      type: {
        type: Sequelize.ENUM('inbound', 'outbound'),
        allowNull: false
      },
      gymId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Gym',
          key: 'id'
        }
      },
      processedBy: {
        type: Sequelize.INTEGER,
        references: {
          model: 'User',
          key: 'id'
        }
      },
      receiptDate: {
        type: Sequelize.DATE,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'completed', 'cancelled'),
        defaultValue: 'pending'
      },
      totalValue: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0
      },
      notes: {
        type: Sequelize.TEXT
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
    await queryInterface.dropTable('Receipt');
  }
};