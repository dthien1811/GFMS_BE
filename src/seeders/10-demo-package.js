'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Package', [ // SỐ ÍT
      {
        name: 'Premium 3 Months',
        description: '3 months unlimited access with 12 PT sessions',
        type: 'premium',
        durationDays: 90,
        price: 10000000,
        sessions: 12,
        gymId: 1,
        status: 'active',
        pricePerSession: 833333.33,
        commissionRate: 0.6,
        isActive: true,
        validityType: 'months',
        maxSessionsPerWeek: 3,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Basic 1 Month',
        description: '1 month gym access only',
        type: 'basic',
        durationDays: 30,
        price: 2000000,
        sessions: 0,
        gymId: 1,
        status: 'active',
        pricePerSession: 0,
        commissionRate: 0,
        isActive: true,
        validityType: 'months',
        maxSessionsPerWeek: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'PT Package 10 Sessions',
        description: '10 personal training sessions',
        type: 'pt_only',
        durationDays: 60,
        price: 8000000,
        sessions: 10,
        gymId: 1,
        status: 'active',
        pricePerSession: 800000,
        commissionRate: 0.7,
        isActive: true,
        validityType: 'days',
        maxSessionsPerWeek: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Package', null, {}); // SỐ ÍT
  }
};