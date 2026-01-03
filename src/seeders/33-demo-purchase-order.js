'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('PurchaseOrder', [
      {
        code: 'PO-202401-001',
        quotationId: 1,
        supplierId: 1,
        gymId: 1,
        requestedBy: 2,
        approvedBy: 1, // Assuming admin ID 1
        orderDate: new Date('2024-01-06'),
        expectedDeliveryDate: new Date('2024-01-20'),
        status: 'delivered',
        totalAmount: 18500000,
        notes: 'Initial equipment order - Urgent for gym opening',
        createdAt: new Date('2024-01-06'),
        updatedAt: new Date('2024-01-06')
      },
      {
        code: 'PO-202401-002',
        quotationId: 3,
        supplierId: 3,
        gymId: 2,
        requestedBy: 2,
        approvedBy: 1,
        orderDate: new Date('2024-01-13'),
        expectedDeliveryDate: new Date('2024-01-27'),
        status: 'ordered',
        totalAmount: 12000000,
        notes: 'Cardio equipment for branch expansion',
        createdAt: new Date('2024-01-13'),
        updatedAt: new Date('2024-01-13')
      },
      {
        code: 'PO-202402-001',
        quotationId: 2,
        supplierId: 2,
        gymId: 1,
        requestedBy: 2,
        approvedBy: null, // Not yet approved
        orderDate: new Date('2024-02-02'),
        expectedDeliveryDate: new Date('2024-02-16'),
        status: 'pending',
        totalAmount: 7500000,
        notes: 'Accessories order - pending budget approval',
        createdAt: new Date('2024-02-02'),
        updatedAt: new Date('2024-02-02')
      },
      {
        code: 'PO-202402-002',
        quotationId: 4,
        supplierId: 1,
        gymId: 1,
        requestedBy: 2,
        approvedBy: 1,
        orderDate: new Date('2024-02-03'),
        expectedDeliveryDate: new Date('2024-02-17'),
        status: 'approved',
        totalAmount: 9500000,
        notes: 'Regular maintenance equipment',
        createdAt: new Date('2024-02-03'),
        updatedAt: new Date('2024-02-03')
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('PurchaseOrder', null, {});
  }
};