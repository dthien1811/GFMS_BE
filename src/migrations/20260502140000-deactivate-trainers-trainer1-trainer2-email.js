"use strict";

/**
 * Ẩn PT có email trainer1@gmail.com / trainer2@gmail.com (trainer.isActive = 0).
 */
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `
      UPDATE \`trainer\` t
      INNER JOIN \`user\` u ON u.id = t.userId
      SET t.isActive = 0
      WHERE LOWER(TRIM(u.email)) IN (
        'trainer1@gmail.com',
        'trainer2@gmail.com'
      )
      `
    );
  },

  down: async () => {},
};
