'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Inventory', [
      // Initial stock entries
      {
        equipmentId: 1,
        gymId: 1,
        transactionType: 'purchase',
        transactionId: 1,
        transactionCode: 'PO-202401-001',
        quantity: 2,
        unitPrice: 4500000,
        totalValue: 9000000,
        stockBefore: 0,
        stockAfter: 2,
        notes: 'Initial purchase - 2 treadmills',
        recordedBy: 2,
        recordedAt: new Date('2024-01-20'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        equipmentId: 2,
        gymId: 1,
        transactionType: 'purchase',
        transactionId: 1,
        transactionCode: 'PO-202401-001',
        quantity: 3,
        unitPrice: 2500000,
        totalValue: 7500000,
        stockBefore: 0,
        stockAfter: 3,
        notes: 'Initial purchase - 3 spin bikes',
        recordedBy: 2,
        recordedAt: new Date('2024-01-20'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        equipmentId: 4,
        gymId: 1,
        transactionType: 'purchase',
        transactionId: 1,
        transactionCode: 'PO-202401-001',
        quantity: 1,
        unitPrice: 2000000,
        totalValue: 2000000,
        stockBefore: 0,
        stockAfter: 1,
        notes: 'Initial purchase - dumbbell set',
        recordedBy: 2,
        recordedAt: new Date('2024-01-20'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Manual adjustment entries
      {
        equipmentId: 7,
        gymId: 1,
        transactionType: 'adjustment',
        transactionId: 2,
        transactionCode: 'REC-202402-001',
        quantity: 5,
        unitPrice: 100000,
        totalValue: 500000,
        stockBefore: 0,
        stockAfter: 5,
        notes: 'Manual stock addition - found in storage',
        recordedBy: 2,
        recordedAt: new Date('2024-02-05'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Disposal entry
      {
        equipmentId: 7,
        gymId: 1,
        transactionType: 'adjustment',
        transactionId: 3,
        transactionCode: 'REC-202402-002',
        quantity: -1,
        unitPrice: 350000,
        totalValue: -350000,
        stockBefore: 5,
        stockAfter: 4,
        notes: 'Damaged equipment disposal',
        recordedBy: 2,
        recordedAt: new Date('2024-02-10'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Gym 2 initial stock
      {
        equipmentId: 1,
        gymId: 2,
        transactionType: 'purchase',
        transactionId: 2,
        transactionCode: 'PO-202401-002',
        quantity: 1,
        unitPrice: 4500000,
        totalValue: 4500000,
        stockBefore: 0,
        stockAfter: 1,
        notes: 'Treadmill for branch',
        recordedBy: 2,
        recordedAt: new Date('2024-01-27'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        equipmentId: 3,
        gymId: 2,
        transactionType: 'purchase',
        transactionId: 2,
        transactionCode: 'PO-202401-002',
        quantity: 2,
        unitPrice: 3750000,
        totalValue: 7500000,
        stockBefore: 0,
        stockAfter: 2,
        notes: 'Elliptical trainers',
        recordedBy: 2,
        recordedAt: new Date('2024-01-27'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Transfer example (from Gym 1 to Gym 2)
      {
        equipmentId: 4,
        gymId: 1,
        transactionType: 'transfer_out',
        transactionId: 1,
        transactionCode: 'TRF-202402-001',
        quantity: -1,
        unitPrice: 2000000,
        totalValue: -2000000,
        stockBefore: 12,
        stockAfter: 11,
        notes: 'Transfer to Gym 2',
        recordedBy: 2,
        recordedAt: new Date('2024-02-15'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        equipmentId: 4,
        gymId: 2,
        transactionType: 'transfer_in',
        transactionId: 1,
        transactionCode: 'TRF-202402-001',
        quantity: 1,
        unitPrice: 2000000,
        totalValue: 2000000,
        stockBefore: 0,
        stockAfter: 1,
        notes: 'Transfer from Gym 1',
        recordedBy: 2,
        recordedAt: new Date('2024-02-15'),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Inventory', null, {});
  }
};