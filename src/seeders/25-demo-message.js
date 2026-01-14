'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('message', [ // SỐ ÍT
      {
        senderId: 4,
        receiverId: 3,
        content: 'Hi John, can we reschedule tomorrow\'s session to 4 PM?',
        isRead: true,
        readAt: new Date('2024-02-17 10:30:00'),
        createdAt: new Date('2024-02-17 10:15:00'),
        updatedAt: new Date()
      },
      {
        senderId: 3,
        receiverId: 4,
        content: 'Sure Mike, 4 PM works for me. See you then!',
        isRead: false,
        readAt: null,
        createdAt: new Date('2024-02-17 10:32:00'),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('message', null, {}); // SỐ ÍT
  }
};