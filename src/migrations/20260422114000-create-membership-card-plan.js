"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("membershipcardplan", {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      gymId: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      months: { type: Sequelize.INTEGER, allowNull: false },
      price: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdBy: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    try { await queryInterface.addIndex("membershipcardplan", ["gymId"], { name: "idx_mcp_gym" }); } catch (_e) {}
    try { await queryInterface.addIndex("membershipcardplan", ["gymId", "isActive"], { name: "idx_mcp_gym_active" }); } catch (_e) {}
    try { await queryInterface.addIndex("membershipcardplan", ["months"], { name: "idx_mcp_months" }); } catch (_e) {}
  },

  async down(queryInterface) {
    try { await queryInterface.removeIndex("membershipcardplan", "idx_mcp_gym"); } catch (_e) {}
    try { await queryInterface.removeIndex("membershipcardplan", "idx_mcp_gym_active"); } catch (_e) {}
    try { await queryInterface.removeIndex("membershipcardplan", "idx_mcp_months"); } catch (_e) {}
    await queryInterface.dropTable("membershipcardplan");
  },
};
