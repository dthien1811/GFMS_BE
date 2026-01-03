'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('GroupRole', [ // SỐ ÍT
      // Admin group gets all roles
      { groupId: 1, roleId: 1, createdAt: new Date(), updatedAt: new Date() },
      { groupId: 1, roleId: 2, createdAt: new Date(), updatedAt: new Date() },
      { groupId: 1, roleId: 3, createdAt: new Date(), updatedAt: new Date() },
      { groupId: 1, roleId: 4, createdAt: new Date(), updatedAt: new Date() },
      // Owner group gets owner role
      { groupId: 2, roleId: 2, createdAt: new Date(), updatedAt: new Date() },
      // Trainer group gets trainer role
      { groupId: 3, roleId: 3, createdAt: new Date(), updatedAt: new Date() },
      // Member group gets member role
      { groupId: 4, roleId: 4, createdAt: new Date(), updatedAt: new Date() }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('GroupRole', null, {}); // SỐ ÍT
  }
};