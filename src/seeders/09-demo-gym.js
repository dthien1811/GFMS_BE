'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert(
      'gym',
      [
        {
          name: 'Power Fit Gym',
          address: '123 Nguyen Trai, District 5, HCM',
          phone: '0909123456',
          email: 'powerfit@gmail.com',
          description: 'Phòng gym hiện đại, đầy đủ thiết bị.',
          status: 'ACTIVE',
          ownerId: 1, // ⚠️ User 2 = gymowner1
          franchiseRequestId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Iron Paradise',
          address: '456 Le Loi, District 1, HCM',
          phone: '0911222333',
          email: 'ironparadise@gmail.com',
          description: 'Gym chuyên bodybuilding và powerlifting.',
          status: 'ACTIVE',
          ownerId: 1, // User 2 = gymowner1
          franchiseRequestId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      {}
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('gym', null, {});
  },
};
