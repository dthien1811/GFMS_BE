'use strict';
module.exports = {
  up: (q) => q.bulkInsert('Notification', [{ userId: 5, title: 'Welcome', message: 'Hi Member', createdAt: new Date(), updatedAt: new Date() }]),
  down: (q) => q.bulkDelete('Notification', null, {})
};'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Notification', [ // SỐ ÍT
      {
        userId: 2,
        title: 'Welcome to GFMS',
        message: 'Your gym owner account has been activated successfully.',
        notificationType: 'system',
        relatedId: 2,
        relatedType: 'User',
        isRead: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        userId: 3,
        title: 'New Booking Request',
        message: 'Member Mike wants to book a session with you.',
        notificationType: 'booking',
        relatedId: 1,
        relatedType: 'Booking',
        isRead: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
       {
        userId: 1,
        title: 'Welcome to GFMS 1111111',
        message: 'Your gym owner account has been activated successfully.',
        notificationType: 'system',
        relatedId: 2,
        relatedType: 'User',
        isRead: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Notification', null, {}); // SỐ ÍT
  }
};