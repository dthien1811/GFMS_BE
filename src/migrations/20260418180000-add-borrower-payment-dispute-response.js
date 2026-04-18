"use strict";

/** Owner chi nhánh mượn phản hồi khiếu nại + ảnh chứng từ CK cho PT */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = "trainershare";
    try {
      await queryInterface.addColumn(table, "borrowerDisputeResponseNote", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    } catch (e) {
      if (!String(e?.message || e).includes("Duplicate column")) throw e;
    }
    try {
      await queryInterface.addColumn(table, "borrowerDisputeResponseAt", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    } catch (e) {
      if (!String(e?.message || e).includes("Duplicate column")) throw e;
    }
    try {
      await queryInterface.addColumn(table, "paymentProofImageUrls", {
        type: Sequelize.JSON,
        allowNull: true,
        comment: "Mảng URL ảnh chứng từ CK (Cloudinary)",
      });
    } catch (e) {
      if (!String(e?.message || e).includes("Duplicate column")) throw e;
    }
  },

  async down(queryInterface) {
    const table = "trainershare";
    try {
      await queryInterface.removeColumn(table, "paymentProofImageUrls");
    } catch {
      /* ignore */
    }
    try {
      await queryInterface.removeColumn(table, "borrowerDisputeResponseAt");
    } catch {
      /* ignore */
    }
    try {
      await queryInterface.removeColumn(table, "borrowerDisputeResponseNote");
    } catch {
      /* ignore */
    }
  },
};
