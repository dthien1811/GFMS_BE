"use strict";

/** Nhận xét của PT gửi cho hội viên sau khi hoàn thành buổi (hiển thị cho member). */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = "booking";
    try {
      await queryInterface.addColumn(table, "ptMemberFeedback", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    } catch (e) {
      if (!String(e?.message || e).includes("Duplicate column")) throw e;
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeColumn("booking", "ptMemberFeedback");
    } catch {
      /* ignore */
    }
  },
};
