'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Attendance', [ // SỐ ÍT
      {
        userId: 4,
        gymId: 1,
        bookingId: 1,
        checkInTime: new Date('2024-02-15 08:55:00'),
        checkOutTime: new Date('2024-02-15 10:05:00'),
        attendanceType: 'member',
        method: 'qr',
        status: 'present',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        userId: 3,
        gymId: 1,
        bookingId: 1,
        checkInTime: new Date('2024-02-15 08:50:00'),
        checkOutTime: new Date('2024-02-15 10:10:00'),
        attendanceType: 'trainer',
        method: 'nfc',
        status: 'present',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Attendance', null, {}); // SỐ ÍT
  }
};