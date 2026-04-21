"use strict";

/** Ghi nhận doanh thu chủ phòng khi buổi quá giờ mà HLV không điểm danh */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("commission");
    if (!table.payee) {
      await queryInterface.addColumn("commission", "payee", {
        type: Sequelize.STRING(16),
        allowNull: true,
      });
    }
    if (!table.retentionReason) {
      await queryInterface.addColumn("commission", "retentionReason", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("commission");
    if (table.retentionReason) {
      await queryInterface.removeColumn("commission", "retentionReason");
    }
    if (table.payee) {
      await queryInterface.removeColumn("commission", "payee");
    }
  },
};
