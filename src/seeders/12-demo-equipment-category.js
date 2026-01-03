'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('EquipmentCategory', [
      {
        name: 'Cardio Equipment',
        code: 'CAT-CARDIO',
        description: 'Cardiovascular training equipment',
        parentId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Strength Training',
        code: 'CAT-STRENGTH',
        description: 'Strength and weight training equipment',
        parentId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Yoga & Pilates',
        code: 'CAT-YOGA',
        description: 'Yoga mats, blocks, and pilates equipment',
        parentId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Treadmills',
        code: 'CAT-TREADMILL',
        description: 'Various types of treadmills',
        parentId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Exercise Bikes',
        code: 'CAT-BIKE',
        description: 'Stationary and spin bikes',
        parentId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Elliptical Trainers',
        code: 'CAT-ELLIPTICAL',
        description: 'Cross trainers and elliptical machines',
        parentId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Dumbbells',
        code: 'CAT-DUMBBELL',
        description: 'Various weight dumbbells',
        parentId: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Benches',
        code: 'CAT-BENCH',
        description: 'Weight benches and racks',
        parentId: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Weight Plates',
        code: 'CAT-PLATES',
        description: 'Olympic and standard weight plates',
        parentId: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Yoga Mats',
        code: 'CAT-YOGAMAT',
        description: 'Various types of yoga mats',
        parentId: 3,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('EquipmentCategory', null, {});
  }
};