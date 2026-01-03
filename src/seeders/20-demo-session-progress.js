'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('SessionProgress', [ // SỐ ÍT
      {
        memberId: 1,
        bookingId: 1,
        trainerId: 1,
        weight: 74.5,
        bodyFat: 22.5,
        muscleMass: 35.2,
        notes: 'Good first session, client motivated',
        exercises: JSON.stringify([
          { name: 'Treadmill', duration: '15 mins', calories: 150 },
          { name: 'Bench Press', sets: 3, reps: 10, weight: '40kg' },
          { name: 'Squats', sets: 3, reps: 12, weight: '50kg' }
        ]),
        sessionRating: 5,
        completedAt: new Date('2024-02-15 10:00:00'),
        attendanceId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('SessionProgress', null, {}); // SỐ ÍT
  }
};