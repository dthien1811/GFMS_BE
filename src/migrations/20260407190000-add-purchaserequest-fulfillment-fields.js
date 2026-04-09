"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE purchaserequest
      ADD COLUMN availableQty INT NULL DEFAULT 0 AFTER expectedUnitPrice,
      ADD COLUMN issueQty INT NULL DEFAULT 0 AFTER availableQty,
      ADD COLUMN purchaseQty INT NULL DEFAULT 0 AFTER issueQty,
      ADD COLUMN payableAmount DECIMAL(15,2) NULL DEFAULT 0 AFTER purchaseQty,
      ADD COLUMN depositAmount DECIMAL(15,2) NULL DEFAULT 0 AFTER payableAmount,
      ADD COLUMN remainingAmount DECIMAL(15,2) NULL DEFAULT 0 AFTER depositAmount
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE purchaserequest
      DROP COLUMN remainingAmount,
      DROP COLUMN depositAmount,
      DROP COLUMN payableAmount,
      DROP COLUMN purchaseQty,
      DROP COLUMN issueQty,
      DROP COLUMN availableQty
    `);
  },
};
