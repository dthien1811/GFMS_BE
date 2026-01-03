'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('EquipmentStock', [
      // Gym 1 stocks
      {
        equipmentId: 1,
        gymId: 1,
        quantity: 5,
        reservedQuantity: 1,
        availableQuantity: 4,
        location: 'Main Hall - Cardio Area A',
        reorderPoint: 2,
        lastRestocked: new Date('2024-01-15'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        equipmentId: 2,
        gymId: 1,
        quantity: 8,
        reservedQuantity: 2,
        availableQuantity: 6,
        location: 'Spinning Studio - Row 1',
        reorderPoint: 4,
        lastRestocked: new Date('2024-01-20'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        equipmentId: 3,
        gymId: 1,
        quantity: 3,
        reservedQuantity: 0,
        availableQuantity: 3,
        location: 'Cardio Area B',
        reorderPoint: 2,
        lastRestocked: new Date('2024-01-10'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        equipmentId: 4,
        gymId: 1,
        quantity: 12,
        reservedQuantity: 0,
        availableQuantity: 12,
        location: 'Free Weights Area - Rack A',
        reorderPoint: 6,
        lastRestocked: new Date('2024-01-05'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        equipmentId: 5,
        gymId: 1,
        quantity: 4,
        reservedQuantity: 0,
        availableQuantity: 4,
        location: 'Strength Training Area - Bench Section',
        reorderPoint: 2,
        lastRestocked: new Date('2024-01-12'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        equipmentId: 6,
        gymId: 1,
        quantity: 2,
        reservedQuantity: 0,
        availableQuantity: 2,
        location: 'Weight Room - Plate Rack',
        reorderPoint: 1,
        lastRestocked: new Date('2024-01-08'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        equipmentId: 7,
        gymId: 1,
        quantity: 25,
        reservedQuantity: 5,
        availableQuantity: 20,
        location: 'Yoga Studio - Storage Cabinet',
        reorderPoint: 10,
        lastRestocked: new Date('2024-01-25'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      
      // Gym 2 stocks
      {
        equipmentId: 1,
        gymId: 2,
        quantity: 3,
        reservedQuantity: 0,
        availableQuantity: 3,
        location: 'Cardio Zone - Front Row',
        reorderPoint: 2,
        lastRestocked: new Date('2024-01-18'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        equipmentId: 2,
        gymId: 2,
        quantity: 6,
        reservedQuantity: 1,
        availableQuantity: 5,
        location: 'Cycle Room',
        reorderPoint: 3,
        lastRestocked: new Date('2024-01-22'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        equipmentId: 4,
        gymId: 2,
        quantity: 8,
        reservedQuantity: 0,
        availableQuantity: 8,
        location: 'Dumbbell Rack',
        reorderPoint: 4,
        lastRestocked: new Date('2024-01-14'),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        equipmentId: 7,
        gymId: 2,
        quantity: 15,
        reservedQuantity: 3,
        availableQuantity: 12,
        location: 'Mind & Body Studio',
        reorderPoint: 8,
        lastRestocked: new Date('2024-01-28'),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('EquipmentStock', null, {});
  }
};