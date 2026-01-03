'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Attendance', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { 
        type: Sequelize.INTEGER,
        references: { model: 'User', key: 'id' } // SỐ ÍT
      },
      gymId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Gym', key: 'id' } // SỐ ÍT
      },
      bookingId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Booking', key: 'id' } // SỐ ÍT
      },
      checkInTime: { type: Sequelize.DATE },
      checkOutTime: { type: Sequelize.DATE },
      attendanceType: { type: Sequelize.ENUM('member', 'trainer') },
      method: { type: Sequelize.ENUM('qr', 'nfc', 'manual') },
      status: { type: Sequelize.ENUM('present', 'late', 'absent') },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Attendance'); // SỐ ÍT
  }
};