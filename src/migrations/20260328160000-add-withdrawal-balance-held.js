"use strict";

/** true = đã trừ pendingCommission lúc PT gửi yêu cầu; false = bản ghi cũ (trừ khi owner duyệt) */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("withdrawal", "balanceHeld", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("withdrawal", "balanceHeld");
  },
};
