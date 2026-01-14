'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('sessionprogress', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      memberId: { 
        type: Sequelize.INTEGER,
        references: { model: 'member', key: 'id' } // SỐ ÍT
      },
      bookingId: { 
        type: Sequelize.INTEGER,
        references: { model: 'booking', key: 'id' } // SỐ ÍT
      },
      trainerId: { 
        type: Sequelize.INTEGER,
        references: { model: 'trainer', key: 'id' } // SỐ ÍT
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
        references: { model: 'attendance', key: 'id' } // SỐ ÍT
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('sessionprogress'); // SỐ ÍT
  }
};