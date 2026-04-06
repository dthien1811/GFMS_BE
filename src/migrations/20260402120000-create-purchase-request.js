"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("purchaserequest", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      code: { type: Sequelize.STRING, allowNull: false, unique: true },
      gymId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "gym", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      equipmentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "equipment", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      expectedSupplierId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "supplier", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      requestedBy: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "user", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      quantity: { type: Sequelize.INTEGER, allowNull: false },
      expectedUnitPrice: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      reason: { type: Sequelize.STRING(64), allowNull: false },
      priority: { type: Sequelize.STRING(32), allowNull: false, defaultValue: "normal" },
      note: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: "submitted" },
      adminRejectionNote: { type: Sequelize.TEXT, allowNull: true },
      quotationId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "quotation", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      stockSnapshot: { type: Sequelize.JSON, allowNull: true },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("purchaserequest");
  },
};
