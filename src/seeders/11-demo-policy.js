'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Policy', [ // SỐ ÍT
      {
        policyType: 'trainer_share',
        name: 'Default Trainer Share Policy',
        description: 'Default commission split for shared trainers',
        value: JSON.stringify({ commissionSplit: 0.7, maxHoursPerWeek: 20 }),
        isActive: true,
        appliesTo: 'system',
        gymId: null,
        effectiveFrom: new Date('2024-01-01'),
        effectiveTo: new Date('2024-12-31'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        policyType: 'cancellation',
        name: 'Booking Cancellation Policy',
        description: 'Cancellation fee and notice period',
        value: JSON.stringify({ 
          cancelBeforeHours: 24, 
          cancellationFee: 0.2,
          noShowFee: 0.5 
        }),
        isActive: true,
        appliesTo: 'system',
        gymId: null,
        effectiveFrom: new Date('2024-01-01'),
        effectiveTo: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Policy', null, {}); // SỐ ÍT
  }
};