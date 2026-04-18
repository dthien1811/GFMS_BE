"use strict";

/** Giá buổi mượn PT + thông tin CK do bên nhận tiền (gym nguồn) gửi cho bên mượn */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = "trainershare";
    const add = async (column, definition) => {
      try {
        await queryInterface.addColumn(table, column, definition);
      } catch (e) {
        if (String(e?.message || e).includes("Duplicate column")) return;
        throw e;
      }
    };

    await add("sessionPrice", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
      comment: "Giá một buổi (VND), do owner chi nhánh mượn nhập",
    });
    await add("sharePaymentStatus", {
      type: Sequelize.STRING(32),
      allowNull: true,
      defaultValue: "none",
      comment: "none | awaiting_transfer | paid",
    });
    await add("lenderBankName", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await add("lenderBankAccountNumber", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await add("lenderAccountHolderName", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await add("paymentInstructionSentAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await add("paymentMarkedPaidAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    const table = "trainershare";
    for (const col of [
      "sessionPrice",
      "sharePaymentStatus",
      "lenderBankName",
      "lenderBankAccountNumber",
      "lenderAccountHolderName",
      "paymentInstructionSentAt",
      "paymentMarkedPaidAt",
    ]) {
      try {
        await queryInterface.removeColumn(table, col);
      } catch {
        /* ignore */
      }
    }
  },
};
