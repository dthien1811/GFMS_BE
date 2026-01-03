'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('QuotationItem', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      quotationId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Quotation',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      equipmentId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Equipment',
          key: 'id'
        }
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      unitPrice: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      totalPrice: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
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
    await queryInterface.dropTable('QuotationItem');
  }
};