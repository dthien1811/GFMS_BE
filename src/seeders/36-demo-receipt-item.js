'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('ReceiptItem', [
      // Items for REC-202401-001 (PO-202401-001 delivery)
      {
        receiptId: 1,
        equipmentId: 1,
        quantity: 2,
        unitPrice: 4500000,
        totalPrice: 9000000,
        batchNumber: 'BATCH-TREAD-2024-001',
        expiryDate: null,
        notes: 'Serial: TREAD001, TREAD002',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        receiptId: 1,
        equipmentId: 2,
        quantity: 3,
        unitPrice: 2500000,
        totalPrice: 7500000,
        batchNumber: 'BATCH-BIKE-2024-001',
        expiryDate: null,
        notes: 'Serial: BIKE001-003',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        receiptId: 1,
        equipmentId: 4,
        quantity: 1,
        unitPrice: 2000000,
        totalPrice: 2000000,
        batchNumber: 'BATCH-DUMB-2024-001',
        expiryDate: null,
        notes: 'Complete set 5-30kg',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Items for REC-202402-001 (Manual addition)
      {
        receiptId: 2,
        equipmentId: 7,
        quantity: 5,
        unitPrice: 100000,
        totalPrice: 500000,
        batchNumber: 'MANUAL-ADD-001',
        expiryDate: null,
        notes: 'Found in storage, added to inventory',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Items for REC-202402-002 (Disposal)
      {
        receiptId: 3,
        equipmentId: 7,
        quantity: 1,
        unitPrice: 350000,
        totalPrice: 350000,
        batchNumber: 'DAMAGED-001',
        expiryDate: null,
        notes: 'Damaged beyond repair, disposed',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Items for REC-202402-003 (Pending PO-202401-002 delivery)
      {
        receiptId: 4,
        equipmentId: 1,
        quantity: 1,
        unitPrice: 4500000,
        totalPrice: 4500000,
        batchNumber: 'BATCH-TREAD-2024-002',
        expiryDate: null,
        notes: 'Expected serial: TREAD003',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        receiptId: 4,
        equipmentId: 3,
        quantity: 2,
        unitPrice: 3750000,
        totalPrice: 7500000,
        batchNumber: 'BATCH-ELLIP-2024-001',
        expiryDate: null,
        notes: 'Expected serial: ELLIP001-002',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('ReceiptItem', null, {});
  }
};