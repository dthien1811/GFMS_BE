"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn("membershipcardplan", "imageUrl", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    } catch (_e) {}
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeColumn("membershipcardplan", "imageUrl");
    } catch (_e) {}
  },
};
