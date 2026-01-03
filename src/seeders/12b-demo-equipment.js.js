'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Equipment', [
      {
        name: 'Commercial Treadmill Pro',
        code: 'EQ-TREADMILL-001',
        description: 'High-end commercial treadmill with incline and heart rate monitoring',
        categoryId: 4,
        brand: 'Life Fitness',
        model: 'T5',
        specifications: JSON.stringify({
          motor: '4.0 HP',
          speed: '0-20 km/h',
          incline: '0-15%',
          display: 'LCD Touchscreen',
          weightCapacity: '180 kg',
          warranty: '3 years'
        }),
        unit: 'piece',
        minStockLevel: 2,
        maxStockLevel: 10,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Spin Bike Elite',
        code: 'EQ-BIKE-001',
        description: 'Professional spin bike for cycling classes',
        categoryId: 5,
        brand: 'Keiser',
        model: 'M3i',
        specifications: JSON.stringify({
          resistance: 'Magnetic',
          flywheel: '8 kg',
          display: 'Wireless compatible',
          pedals: 'SPD compatible',
          warranty: '5 years'
        }),
        unit: 'piece',
        minStockLevel: 3,
        maxStockLevel: 15,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Elliptical Cross Trainer',
        code: 'EQ-ELLIPTICAL-001',
        description: 'Low impact full body workout machine',
        categoryId: 6,
        brand: 'Precor',
        model: 'EFX 885',
        specifications: JSON.stringify({
          stride: 'Adjustable 38-50 cm',
          resistance: '20 levels',
          programs: '12 preset',
          display: 'Backlit LCD',
          warranty: '2 years'
        }),
        unit: 'piece',
        minStockLevel: 2,
        maxStockLevel: 8,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Rubber Dumbbell Set',
        code: 'EQ-DUMBBELL-001',
        description: 'Set of rubber coated dumbbells (5-30kg)',
        categoryId: 7,
        brand: 'Umi',
        model: 'PRO-RUBBER',
        specifications: JSON.stringify({
          weights: '[5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30] kg',
          material: 'Rubber coated',
          storage: 'Rack included',
          warranty: 'Lifetime'
        }),
        unit: 'set',
        minStockLevel: 5,
        maxStockLevel: 20,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Adjustable Weight Bench',
        code: 'EQ-BENCH-001',
        description: 'Multi-position adjustable weight bench',
        categoryId: 8,
        brand: 'Body-Solid',
        model: 'GFID71',
        specifications: JSON.stringify({
          positions: '7 back, 3 seat',
          maxWeight: '300 kg',
          padding: 'High-density foam',
          frame: 'Steel 2x2',
          warranty: '2 years'
        }),
        unit: 'piece',
        minStockLevel: 2,
        maxStockLevel: 8,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Olympic Weight Plates Set',
        code: 'EQ-PLATES-001',
        description: 'Set of Olympic weight plates (1.25-20kg)',
        categoryId: 9,
        brand: 'Rogue',
        model: 'Olympic Color',
        specifications: JSON.stringify({
          plates: '[1.25, 2.5, 5, 10, 15, 20] kg each',
          material: 'Cast iron with color coating',
          hole: 'Olympic 50.8mm',
          warranty: 'Lifetime'
        }),
        unit: 'set',
        minStockLevel: 3,
        maxStockLevel: 12,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Premium Yoga Mat',
        code: 'EQ-YOGAMAT-001',
        description: 'Non-slip eco-friendly yoga mat',
        categoryId: 10,
        brand: 'Manduka',
        model: 'PRO Lite',
        specifications: JSON.stringify({
          thickness: '6mm',
          material: 'Eco-friendly PVC',
          size: '183 x 61 cm',
          weight: '2.3 kg',
          warranty: '1 year'
        }),
        unit: 'piece',
        minStockLevel: 20,
        maxStockLevel: 100,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Equipment', null, {});
  }
};