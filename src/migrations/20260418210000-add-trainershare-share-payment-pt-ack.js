"use strict";

/** PT xác nhận đã nhận / đồng ý sau phản hồi chủ phòng mượn */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = "trainershare";
    try {
      await queryInterface.addColumn(table, "sharePaymentPtAcknowledgedAt", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    } catch (e) {
      if (!String(e?.message || e).includes("Duplicate column")) throw e;
    }
  },

  async down(queryInterface) {
    const table = "trainershare";
    try {
      await queryInterface.removeColumn(table, "sharePaymentPtAcknowledgedAt");
    } catch {
      /* ignore */
    }
  },
};
