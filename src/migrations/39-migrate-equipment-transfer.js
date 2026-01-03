'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('EquipmentTransfer', {
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
      fromGymId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Gym',
          key: 'id'
        },
        allowNull: false
      },
      toGymId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Gym',
          key: 'id'
        },
        allowNull: false
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
      transferDate: {
        type: Sequelize.DATE,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'in_transit', 'completed', 'cancelled'),
        defaultValue: 'pending'
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
    await queryInterface.dropTable('EquipmentTransfer');
  }
};