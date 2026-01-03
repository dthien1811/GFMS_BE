'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Member', [ // SỐ ÍT
      {
        userId: 4,
        gymId: 1,
        membershipNumber: 'MEM2024001',
        joinDate: new Date('2024-01-20'),
        expiryDate: new Date('2024-07-20'),
        height: 175.5,
        weight: 75.0,
        fitnessGoal: 'Lose 5kg weight, build muscle',
        status: 'active',
        notes: 'New member, interested in weight loss program',
        currentPackageId: 1,
        packageActivationId: null, // Will be set after PackageActivation seeder
        sessionsRemaining: 12,
        packageExpiryDate: new Date('2024-04-20'),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Member', null, {}); // SỐ ÍT
  }
};