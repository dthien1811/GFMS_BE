'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('PurchaseOrder', {
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
      quotationId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Quotation',
          key: 'id'
        }
      },
      supplierId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Supplier',
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
      requestedBy: {
        type: Sequelize.INTEGER,
        references: {
          model: 'User',
          key: 'id'
        }
      },
      approvedBy: {
        type: Sequelize.INTEGER,
        references: {
          model: 'User',
          key: 'id'
        }
      },
      orderDate: {
        type: Sequelize.DATE,
        allowNull: false
      },
      expectedDeliveryDate: {
        type: Sequelize.DATE
      },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'ordered', 'delivered', 'cancelled'),
        defaultValue: 'pending'
      },
      totalAmount: {
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
    await queryInterface.dropTable('PurchaseOrder');
  }
};