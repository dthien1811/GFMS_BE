'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('EquipmentTransferItem', [
      // Items for TRF-202402-001 (completed transfer)
      {
        transferId: 1,
        equipmentId: 4,
        quantity: 1,
        notes: 'Rubber dumbbell set (5-30kg)',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        transferId: 1,
        equipmentId: 7,
        quantity: 5,
        notes: 'Premium yoga mats',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Items for TRF-202402-002 (pending transfer)
      {
        transferId: 2,
        equipmentId: 2,
        quantity: 2,
        notes: 'Spin bikes for cycling event',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Items for TRF-202403-001 (in transit)
      {
        transferId: 3,
        equipmentId: 1,
        quantity: 1,
        notes: 'Treadmill after maintenance repair',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Items for TRF-202403-002 (pending)
      {
        transferId: 4,
        equipmentId: 7,
        quantity: 10,
        notes: 'Yoga mats for new class',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        transferId: 4,
        equipmentId: 5,
        quantity: 1,
        notes: 'Adjustable bench',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('EquipmentTransferItem', null, {});
  }
};