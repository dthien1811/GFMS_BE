'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE request
      MODIFY COLUMN requestType ENUM('LEAVE', 'SHIFT_CHANGE', 'TRANSFER_BRANCH', 'OVERTIME', 'BECOME_TRAINER', 'BUSY_SLOT') NOT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE request
      MODIFY COLUMN requestType ENUM('LEAVE', 'SHIFT_CHANGE', 'TRANSFER_BRANCH', 'OVERTIME', 'BECOME_TRAINER') NOT NULL;
    `);
  },
};
