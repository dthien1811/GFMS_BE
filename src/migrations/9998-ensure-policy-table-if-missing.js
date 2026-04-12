"use strict";

/**
 * Một số môi trường (vd. Aiven defaultdb) chưa có bảng `policy` nhưng app vẫn join Policy
 * (trainershare, override, …) → Table 'defaultdb.policy' doesn't exist.
 * Tên file 9998-* để chạy sau 23-migrate-policy.js (tránh trùng createTable khi cài mới).
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    const names = tables.map((t) => (typeof t === "string" ? t : t.tableName || t.name || String(t)));
    if (names.some((n) => String(n).toLowerCase() === "policy")) {
      return;
    }

    await queryInterface.createTable("policy", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      policyType: {
        type: Sequelize.ENUM("trainer_share", "commission", "cancellation", "refund", "membership"),
      },
      name: { type: Sequelize.STRING },
      description: { type: Sequelize.TEXT },
      value: { type: Sequelize.JSON },
      isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
      appliesTo: { type: Sequelize.ENUM("system", "gym", "trainer") },
      gymId: {
        type: Sequelize.INTEGER,
        references: { model: "gym", key: "id" },
      },
      effectiveFrom: { type: Sequelize.DATE },
      effectiveTo: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  down: async () => {
    // Không drop bảng: tránh xóa policy thật khi rollback migration vá lỗi.
  },
};
