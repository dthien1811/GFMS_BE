"use strict";

/** Liên kết buổi tập với phiếu mượn PT — không phụ thuộc khớp ngày/giờ thủ công */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = "booking";
    try {
      await queryInterface.addColumn(table, "trainerShareId", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "trainershare", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        comment: "Phiếu mượn PT (nếu buổi tạo/ghép từ chia sẻ HLV)",
      });
    } catch (e) {
      if (!String(e?.message || e).includes("Duplicate column")) throw e;
    }
    try {
      await queryInterface.addIndex(table, ["trainerShareId"], {
        name: "booking_trainerShareId_idx",
      });
    } catch (e) {
      if (!String(e?.message || e).includes("Duplicate")) throw e;
    }
  },

  async down(queryInterface) {
    const table = "booking";
    try {
      await queryInterface.removeIndex(table, "booking_trainerShareId_idx");
    } catch {
      /* ignore */
    }
    try {
      await queryInterface.removeColumn(table, "trainerShareId");
    } catch {
      /* ignore */
    }
  },
};
