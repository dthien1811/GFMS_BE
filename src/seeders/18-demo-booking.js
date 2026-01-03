'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Booking', [ // SỐ ÍT
      {
        memberId: 1,
        trainerId: 1,
        gymId: 1,
        packageId: 1,
        bookingDate: new Date('2024-02-15'),
        startTime: '09:00:00',
        endTime: '10:00:00',
        sessionType: 'personal_training',
        notes: 'First session, focus on assessment',
        status: 'completed',
        checkinTime: new Date('2024-02-15 08:55:00'),
        checkoutTime: new Date('2024-02-15 10:05:00'),
        sessionNotes: 'Client showed good form, needs to work on cardio',
        cancellationReason: null,
        noShowFee: 0,
        createdBy: 4,
        cancellationDate: null,
        cancellationBy: null,
        rating: 5,
        reviewComment: 'Great trainer, very professional',
        packageActivationId: 1,
        sessionValue: 833333.33,
        commissionCalculated: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        memberId: 1,
        trainerId: 1,
        gymId: 1,
        packageId: 1,
        bookingDate: new Date('2024-02-18'),
        startTime: '14:00:00',
        endTime: '15:00:00',
        sessionType: 'personal_training',
        notes: 'Second session - strength training',
        status: 'confirmed',
        checkinTime: null,
        checkoutTime: null,
        sessionNotes: null,
        cancellationReason: null,
        noShowFee: 0,
        createdBy: 4,
        cancellationDate: null,
        cancellationBy: null,
        rating: null,
        reviewComment: null,
        packageActivationId: 1,
        sessionValue: 833333.33,
        commissionCalculated: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Booking', null, {}); // SỐ ÍT
  }
};