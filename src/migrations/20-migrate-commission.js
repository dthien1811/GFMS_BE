'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Commission', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      trainerId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Trainer', key: 'id' } // SỐ ÍT
      },
      bookingId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Booking', key: 'id' } // SỐ ÍT
      },
      gymId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Gym', key: 'id' } // SỐ ÍT
      },
      activationId: { 
        type: Sequelize.INTEGER,
        references: { model: 'PackageActivation', key: 'id' } // SỐ ÍT
      },
      sessionDate: { type: Sequelize.DATE },
      sessionValue: { type: Sequelize.DECIMAL(10, 2) },
      commissionRate: { type: Sequelize.FLOAT },
      commissionAmount: { type: Sequelize.DECIMAL(10, 2) },
      status: { 
        type: Sequelize.ENUM('pending', 'calculated', 'paid'),
        defaultValue: 'pending'
      },
      calculatedAt: { type: Sequelize.DATE },
      paidAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Commission'); // SỐ ÍT
  }
};