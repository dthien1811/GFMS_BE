"use strict";

/** Tránh cộng số dư 2 lần: kỳ mới cộng khi chốt; kỳ cũ (null) vẫn cộng khi owner bấm Chi trả */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("payrollperiod", "walletCreditedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("payrollperiod", "walletCreditedAt");
  },
};
