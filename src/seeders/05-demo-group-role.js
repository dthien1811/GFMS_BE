'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('GroupRole', [
      // Administrators
      { groupId: 1, roleId: 1, createdAt: new Date(), updatedAt: new Date() },

      // Gym Owners
      { groupId: 2, roleId: 2, createdAt: new Date(), updatedAt: new Date() },

      // Trainers
      { groupId: 3, roleId: 3, createdAt: new Date(), updatedAt: new Date() },

      // Members
      { groupId: 4, roleId: 4, createdAt: new Date(), updatedAt: new Date() },

      // Guests
      { groupId: 5, roleId: 5, createdAt: new Date(), updatedAt: new Date() },
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('GroupRole', null, {});
  }
};
