'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('SessionProgress', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      memberId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Member', key: 'id' } // SỐ ÍT
      },
      bookingId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Booking', key: 'id' } // SỐ ÍT
      },
      trainerId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Trainer', key: 'id' } // SỐ ÍT
      },
      weight: { type: Sequelize.FLOAT },
      bodyFat: { type: Sequelize.FLOAT },
      muscleMass: { type: Sequelize.FLOAT },
      notes: { type: Sequelize.TEXT },
      exercises: { type: Sequelize.JSON },
      sessionRating: { type: Sequelize.INTEGER },
      completedAt: { type: Sequelize.DATE },
      attendanceId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Attendance', key: 'id' } // SỐ ÍT
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('SessionProgress'); // SỐ ÍT
  }
};