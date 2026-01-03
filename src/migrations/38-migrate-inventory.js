'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Inventory', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      equipmentId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Equipment',
          key: 'id'
        }
      },
      gymId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Gym',
          key: 'id'
        }
      },
      transactionType: {
        type: Sequelize.ENUM('purchase', 'sale', 'adjustment', 'transfer_in', 'transfer_out', 'return'),
        allowNull: false
      },
      transactionId: {
        type: Sequelize.INTEGER,
        comment: 'Reference to PurchaseOrder, Receipt, etc.'
      },
      transactionCode: {
        type: Sequelize.STRING
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      unitPrice: {
        type: Sequelize.DECIMAL(15, 2)
      },
      totalValue: {
        type: Sequelize.DECIMAL(15, 2)
      },
      stockBefore: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      stockAfter: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      notes: {
        type: Sequelize.TEXT
      },
      recordedBy: {
        type: Sequelize.INTEGER,
        references: {
          model: 'User',
          key: 'id'
        }
      },
      recordedAt: {
        type: Sequelize.DATE,
        allowNull: false
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
    await queryInterface.dropTable('Inventory');
  }
};