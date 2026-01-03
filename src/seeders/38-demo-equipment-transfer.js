'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('EquipmentTransfer', [
      {
        code: 'TRF-202402-001',
        fromGymId: 1,
        toGymId: 2,
        requestedBy: 2,
        approvedBy: 1,
        transferDate: new Date('2024-02-15'),
        status: 'completed',
        notes: 'Transfer dumbbell set to new branch for urgent need',
        createdAt: new Date('2024-02-14'),
        updatedAt: new Date('2024-02-15')
      },
      {
        code: 'TRF-202402-002',
        fromGymId: 1,
        toGymId: 2,
        requestedBy: 2,
        approvedBy: null,
        transferDate: new Date('2024-02-20'),
        status: 'pending',
        notes: 'Request to transfer 2 spin bikes for special event',
        createdAt: new Date('2024-02-18'),
        updatedAt: new Date('2024-02-18')
      },
      {
        code: 'TRF-202403-001',
        fromGymId: 2,
        toGymId: 1,
        requestedBy: 2,
        approvedBy: 1,
        transferDate: new Date('2024-03-05'),
        status: 'in_transit',
        // XÓA DÒNG NÀY: totalValue: 1500000,
        notes: 'Return equipment after maintenance',
        createdAt: new Date('2024-03-01'),
        updatedAt: new Date('2024-03-01')
      },
      {
        code: 'TRF-202403-002',
        fromGymId: 1,
        toGymId: 2,
        requestedBy: 2,
        approvedBy: null,
        transferDate: new Date('2024-03-10'),
        status: 'pending',
        notes: 'Yoga mats for new yoga class at branch 2',
        createdAt: new Date('2024-03-08'),
        updatedAt: new Date('2024-03-08')
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('EquipmentTransfer', null, {});
  }
};