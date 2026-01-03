'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Receipt', [
      {
        code: 'REC-202401-001',
        purchaseOrderId: 1,
        type: 'inbound',
        gymId: 1,
        processedBy: 2,
        receiptDate: new Date('2024-01-20'),
        status: 'completed',
        totalValue: 18500000,
        notes: 'Initial equipment delivery for gym setup',
        createdAt: new Date('2024-01-20'),
        updatedAt: new Date('2024-01-20')
      },
      {
        code: 'REC-202402-001',
        purchaseOrderId: null, // Manual inventory adjustment
        type: 'inbound',
        gymId: 1,
        processedBy: 2,
        receiptDate: new Date('2024-02-05'),
        status: 'completed',
        totalValue: 500000,
        notes: 'Manual stock addition - found extra yoga mats',
        createdAt: new Date('2024-02-05'),
        updatedAt: new Date('2024-02-05')
      },
      {
        code: 'REC-202402-002',
        purchaseOrderId: null,
        type: 'outbound',
        gymId: 1,
        processedBy: 2,
        receiptDate: new Date('2024-02-10'),
        status: 'completed',
        totalValue: 350000,
        notes: 'Damaged equipment disposal - 1 yoga mat',
        createdAt: new Date('2024-02-10'),
        updatedAt: new Date('2024-02-10')
      },
      {
        code: 'REC-202402-003',
        purchaseOrderId: 2,
        type: 'inbound',
        gymId: 2,
        processedBy: 2,
        receiptDate: new Date('2024-02-27'),
        status: 'pending',
        totalValue: 12000000,
        notes: 'Scheduled delivery for cardio equipment',
        createdAt: new Date('2024-02-27'),
        updatedAt: new Date('2024-02-27')
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Receipt', null, {});
  }
};