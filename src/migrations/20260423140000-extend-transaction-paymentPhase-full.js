/* eslint-disable no-unused-vars */
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // MySQL ENUM requires ALTER to extend values. This is safe/idempotent for common setups.
    // If the column is not ENUM (e.g., STRING), this will throw and should be adjusted.
    await queryInterface.sequelize.query(
      "ALTER TABLE `transaction` MODIFY COLUMN `paymentPhase` ENUM('deposit','final','full') NULL;"
    );
  },

  async down(queryInterface, Sequelize) {
    // Revert to previous enum (will fail if any existing row uses 'full').
    await queryInterface.sequelize.query(
      "ALTER TABLE `transaction` MODIFY COLUMN `paymentPhase` ENUM('deposit','final') NULL;"
    );
  },
};

