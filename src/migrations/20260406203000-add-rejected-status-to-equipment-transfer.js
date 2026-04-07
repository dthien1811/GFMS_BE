'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE equipmenttransfer
      MODIFY COLUMN status ENUM('pending', 'approved', 'in_transit', 'completed', 'cancelled', 'rejected')
      NOT NULL DEFAULT 'pending'
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE equipmenttransfer
      SET status = 'cancelled'
      WHERE status = 'rejected'
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE equipmenttransfer
      MODIFY COLUMN status ENUM('pending', 'approved', 'in_transit', 'completed', 'cancelled')
      NOT NULL DEFAULT 'pending'
    `);
  },
};
