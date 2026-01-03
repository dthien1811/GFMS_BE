'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('QuotationItem', [
      // Items for QUO-202401-001
      {
        quotationId: 1,
        equipmentId: 1,
        quantity: 2,
        unitPrice: 4500000,
        totalPrice: 9000000,
        notes: 'Treadmills for cardio area',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        quotationId: 1,
        equipmentId: 2,
        quantity: 3,
        unitPrice: 2500000,
        totalPrice: 7500000,
        notes: 'Spin bikes for cycling class',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        quotationId: 1,
        equipmentId: 4,
        quantity: 1,
        unitPrice: 2000000,
        totalPrice: 2000000,
        notes: 'Dumbbell set for free weights',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Items for QUO-202401-002
      {
        quotationId: 2,
        equipmentId: 7,
        quantity: 20,
        unitPrice: 350000,
        totalPrice: 7000000,
        notes: 'Yoga mats for group classes',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        quotationId: 2,
        equipmentId: 5,
        quantity: 1,
        unitPrice: 500000,
        totalPrice: 500000,
        notes: 'Additional weight bench',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Items for QUO-202401-003
      {
        quotationId: 3,
        equipmentId: 1,
        quantity: 1,
        unitPrice: 4500000,
        totalPrice: 4500000,
        notes: 'Treadmill replacement',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        quotationId: 3,
        equipmentId: 3,
        quantity: 2,
        unitPrice: 3750000,
        totalPrice: 7500000,
        notes: 'Elliptical trainers for gym expansion',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Items for QUO-202402-001
      {
        quotationId: 4,
        equipmentId: 4,
        quantity: 1,
        unitPrice: 2000000,
        totalPrice: 2000000,
        notes: 'Additional dumbbell set',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        quotationId: 4,
        equipmentId: 7,
        quantity: 10,
        unitPrice: 350000,
        totalPrice: 3500000,
        notes: 'Yoga mats restock',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        quotationId: 4,
        equipmentId: 6,
        quantity: 1,
        unitPrice: 4000000,
        totalPrice: 4000000,
        notes: 'Weight plates set',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('QuotationItem', null, {});
  }
};