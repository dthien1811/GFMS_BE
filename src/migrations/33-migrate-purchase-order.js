'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('purchaseorder', {
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
          model: 'quotation',
          key: 'id'
        }
      },
      supplierId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'supplier',
          key: 'id'
        }
      },
      gymId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'gym',
          key: 'id'
        }
      },
      requestedBy: {
        type: Sequelize.INTEGER,
        references: {
          model: 'user',
          key: 'id'
        }
      },
      approvedBy: {
        type: Sequelize.INTEGER,
        references: {
          model: 'user',
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
    await queryInterface.dropTable('purchaseiorder');
  }
};