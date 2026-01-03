'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Maintenance', [ // SỐ ÍT
      {
        equipmentId: 1,
        gymId: 1,
        issueDescription: 'Treadmill belt needs replacement',
        priority: 'medium',
        requestedBy: 2,
        assignedTo: 1,
        estimatedCost: 2000000,
        actualCost: 1800000,
        status: 'completed',
        scheduledDate: new Date('2024-02-01'),
        completionDate: new Date('2024-02-02'),
        notes: 'Belt replaced, machine running smoothly',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Maintenance', null, {}); // SỐ ÍT
  }
};