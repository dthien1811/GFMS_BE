'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('PurchaseOrderItem', [
      // Items for PO-202401-001
      {
        purchaseOrderId: 1,
        equipmentId: 1,
        quantity: 2,
        unitPrice: 4500000,
        totalPrice: 9000000,
        receivedQuantity: 2,
        notes: 'Delivered on time',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        purchaseOrderId: 1,
        equipmentId: 2,
        quantity: 3,
        unitPrice: 2500000,
        totalPrice: 7500000,
        receivedQuantity: 3,
        notes: 'All items received',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        purchaseOrderId: 1,
        equipmentId: 4,
        quantity: 1,
        unitPrice: 2000000,
        totalPrice: 2000000,
        receivedQuantity: 1,
        notes: 'Complete set',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Items for PO-202401-002
      {
        purchaseOrderId: 2,
        equipmentId: 1,
        quantity: 1,
        unitPrice: 4500000,
        totalPrice: 4500000,
        receivedQuantity: 0,
        notes: 'Awaiting shipment',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        purchaseOrderId: 2,
        equipmentId: 3,
        quantity: 2,
        unitPrice: 3750000,
        totalPrice: 7500000,
        receivedQuantity: 0,
        notes: 'Expected next week',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Items for PO-202402-001
      {
        purchaseOrderId: 3,
        equipmentId: 7,
        quantity: 20,
        unitPrice: 350000,
        totalPrice: 7000000,
        receivedQuantity: 0,
        notes: 'Pending approval',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        purchaseOrderId: 3,
        equipmentId: 5,
        quantity: 1,
        unitPrice: 500000,
        totalPrice: 500000,
        receivedQuantity: 0,
        notes: 'Additional bench',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Items for PO-202402-002
      {
        purchaseOrderId: 4,
        equipmentId: 4,
        quantity: 1,
        unitPrice: 2000000,
        totalPrice: 2000000,
        receivedQuantity: 0,
        notes: 'Approved, awaiting delivery',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        purchaseOrderId: 4,
        equipmentId: 7,
        quantity: 10,
        unitPrice: 350000,
        totalPrice: 3500000,
        receivedQuantity: 0,
        notes: 'Yoga mats restock',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        purchaseOrderId: 4,
        equipmentId: 6,
        quantity: 1,
        unitPrice: 4000000,
        totalPrice: 4000000,
        receivedQuantity: 0,
        notes: 'Weight plates for gym 1',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('PurchaseOrderItem', null, {});
  }
};