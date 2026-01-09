'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1) dọn sạch các role prefix cũ (nếu chạy seed nhiều lần)
    await queryInterface.bulkDelete('Role', {
      url: ['/admin', '/owner', '/trainer', '/member', '/guest']
    }, {});

    // 2) insert role prefix
    await queryInterface.bulkInsert('Role', [
      { url: '/admin',   description: 'Admin area (full admin access)', createdAt: new Date(), updatedAt: new Date() },
      { url: '/owner',   description: 'Owner area',                    createdAt: new Date(), updatedAt: new Date() },
      { url: '/trainer', description: 'Trainer area',                  createdAt: new Date(), updatedAt: new Date() },
      { url: '/member',  description: 'Member area',                   createdAt: new Date(), updatedAt: new Date() },
      { url: '/guest',   description: 'Guest view only',               createdAt: new Date(), updatedAt: new Date() },
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    // Lấy id các role prefix cần xoá
    const rows = await queryInterface.sequelize.query(
      "SELECT id FROM `Role` WHERE url IN ('/admin','/owner','/trainer','/member','/guest')",
      { type: Sequelize.QueryTypes.SELECT }
    );

    const roleIds = rows.map(r => r.id);
    if (roleIds.length) {
      // 1) xoá bảng liên kết trước (FK nằm ở đây)
      await queryInterface.bulkDelete('grouprole', { roleId: roleIds }, {});
      // 2) rồi mới xoá role
      await queryInterface.bulkDelete('Role', { id: roleIds }, {});
    }
  }
};
