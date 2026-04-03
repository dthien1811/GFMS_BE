"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("quotation", "purchaseRequestId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "purchaserequest", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("quotation", "purchaseRequestId");
  },
};
