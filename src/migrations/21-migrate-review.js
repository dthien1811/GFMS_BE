'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Review', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      memberId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Member', key: 'id' } // SỐ ÍT
      },
      trainerId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Trainer', key: 'id' } // SỐ ÍT
      },
      bookingId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Booking', key: 'id' } // SỐ ÍT
      },
      rating: { type: Sequelize.INTEGER },
      comment: { type: Sequelize.TEXT },
      status: { 
        type: Sequelize.ENUM('active', 'hidden'),
        defaultValue: 'active'
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Review'); // SỐ ÍT
  }
};