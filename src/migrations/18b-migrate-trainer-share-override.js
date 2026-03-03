"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("trainershareoverride", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },

      // FK chắc chắn tồn tại: trainershare
      trainerShareId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "trainershare", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      // policyId: để INTEGER thôi cho an toàn (tránh sai tên bảng policy)
      policyId: { type: Sequelize.INTEGER, allowNull: true },

      // override split (nullable: có thể override bằng policyId thôi)
      commissionSplit: { type: Sequelize.FLOAT, allowNull: true },

      // ✅ hiệu lực theo thời gian
      effectiveFrom: { type: Sequelize.DATE, allowNull: false },
      effectiveTo: { type: Sequelize.DATE, allowNull: true },

      // bật/tắt override
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },

      notes: { type: Sequelize.TEXT, allowNull: true },

      createdBy: { type: Sequelize.INTEGER, allowNull: true },
      updatedBy: { type: Sequelize.INTEGER, allowNull: true },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("trainershareoverride", ["trainerShareId"]);
    await queryInterface.addIndex("trainershareoverride", ["trainerShareId", "isActive"]);
    await queryInterface.addIndex("trainershareoverride", ["effectiveFrom"]);
    await queryInterface.addIndex("trainershareoverride", ["effectiveTo"]);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("trainershareoverride");
  },
};
