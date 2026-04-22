"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("membershipcard", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      memberId: { type: Sequelize.INTEGER, allowNull: false },
      gymId: { type: Sequelize.INTEGER, allowNull: false },
      transactionId: { type: Sequelize.INTEGER, allowNull: true },
      planCode: { type: Sequelize.STRING(32), allowNull: false },
      planMonths: { type: Sequelize.INTEGER, allowNull: false },
      price: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      startDate: { type: Sequelize.DATE, allowNull: false },
      endDate: { type: Sequelize.DATE, allowNull: false },
      status: {
        type: Sequelize.ENUM("active", "expired", "cancelled"),
        allowNull: false,
        defaultValue: "active",
      },
      purchaseSource: {
        type: Sequelize.ENUM("standalone", "package_bundle"),
        allowNull: false,
        defaultValue: "standalone",
      },
      renewalNotifiedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    try {
      await queryInterface.addIndex("membershipcard", ["memberId"], { name: "idx_mcard_member" });
      await queryInterface.addIndex("membershipcard", ["gymId"], { name: "idx_mcard_gym" });
      await queryInterface.addIndex("membershipcard", ["status", "endDate"], { name: "idx_mcard_status_end" });
    } catch (_e) {}
  },

  async down(queryInterface) {
    try { await queryInterface.removeIndex("membershipcard", "idx_mcard_member"); } catch (_e) {}
    try { await queryInterface.removeIndex("membershipcard", "idx_mcard_gym"); } catch (_e) {}
    try { await queryInterface.removeIndex("membershipcard", "idx_mcard_status_end"); } catch (_e) {}
    await queryInterface.dropTable("membershipcard");
    try { await queryInterface.sequelize.query("DROP TYPE IF EXISTS enum_membershipcard_status;"); } catch (_e) {}
    try { await queryInterface.sequelize.query("DROP TYPE IF EXISTS enum_membershipcard_purchaseSource;"); } catch (_e) {}
  },
};
