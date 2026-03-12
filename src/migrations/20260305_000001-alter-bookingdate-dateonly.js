"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // ✅ Fix dứt điểm timezone lệch ngày
    await queryInterface.changeColumn("booking", "bookingDate", {
      type: Sequelize.DATEONLY, // MySQL DATE
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    // rollback về DATETIME nếu cần
    await queryInterface.changeColumn("booking", "bookingDate", {
      type: Sequelize.DATE, // DATETIME
      allowNull: false,
    });
  },
};