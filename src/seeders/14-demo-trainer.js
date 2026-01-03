'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Trainer', [ // SỐ ÍT
      {
        userId: 3,
        specialization: 'Weight Loss, Strength Training',
        certification: 'ACE Certified Personal Trainer',
        experienceYears: 5,
        hourlyRate: 500000,
        commissionRate: 0.6,
        rating: 4.8,
        totalSessions: 120,
        status: 'active',
        bio: 'Passionate about helping clients achieve their fitness goals',
        availableHours: JSON.stringify({
          monday: [{ start: '09:00', end: '18:00' }],
          tuesday: [{ start: '09:00', end: '18:00' }],
          wednesday: [{ start: '09:00', end: '18:00' }],
          thursday: [{ start: '09:00', end: '18:00' }],
          friday: [{ start: '09:00', end: '18:00' }],
          saturday: [{ start: '09:00', end: '15:00' }],
          sunday: []
        }),
        preferredGyms: JSON.stringify([1, 2]),
        maxSessionsPerDay: 5,
        minBookingNotice: 24,
        isAvailableForShare: true,
        languages: JSON.stringify(['Vietnamese', 'English']),
        socialLinks: JSON.stringify({ instagram: '@trainer_john' }),
        totalEarned: 12000000,
        pendingCommission: 3000000,
        lastPayoutDate: new Date('2024-02-01'),
        payoutMethod: 'bank_transfer',
        bankAccountInfo: JSON.stringify({
          bankName: 'Vietcombank',
          accountNumber: '1234567890',
          accountHolder: 'John Trainer'
        }),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Trainer', null, {}); // SỐ ÍT
  }
};