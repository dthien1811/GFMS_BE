'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Đảm bảo đã có user trước (ownerId phải tồn tại trong bảng User)
    return queryInterface.bulkInsert('Gym', [
      {
        name: 'Gym HCM',
        address: 'Quận 1, TP.HCM',
        phone: '0987654321',
        email: 'hcm@gym.com',
        description: 'Gym cao cấp trung tâm',
        status: 'active',
        ownerId: 1, // Lấy từ user đã seed
        franchiseRequestId: null, // Hoặc ID franchise request nếu có
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Gym Hà Nội',
        address: 'Ba Đình, Hà Nội',
        phone: '0912345678',
        email: 'hn@gym.com',
        description: 'Gym chi nhánh Hà Nội',
        status: 'active',
        ownerId: 2,
        franchiseRequestId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('Gym', null, {});
  }
};