"use strict";

/** PT khiếu nại chưa nhận tiền — ghi chú + thời điểm; sharePaymentStatus = disputed */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = "trainershare";
    try {
      await queryInterface.addColumn(table, "sharePaymentDisputeNote", {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Nội dung khiếu nại của PT (chưa nhận được tiền)",
      });
    } catch (e) {
      if (!String(e?.message || e).includes("Duplicate column")) throw e;
    }
    try {
      await queryInterface.addColumn(table, "sharePaymentDisputedAt", {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Thời điểm PT gửi khiếu nại",
      });
    } catch (e) {
      if (!String(e?.message || e).includes("Duplicate column")) throw e;
    }
  },

  async down(queryInterface) {
    const table = "trainershare";
    try {
      await queryInterface.removeColumn(table, "sharePaymentDisputedAt");
    } catch {
      /* ignore */
    }
    try {
      await queryInterface.removeColumn(table, "sharePaymentDisputeNote");
    } catch {
      /* ignore */
    }
  },
};
