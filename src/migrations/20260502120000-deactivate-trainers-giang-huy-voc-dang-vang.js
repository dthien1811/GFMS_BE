"use strict";

/**
 * Ẩn PT Giang và Huy khỏi marketplace phòng gym "Vóc dáng vàng"
 * (soft-deactivate trainer.isActive — không xóa user/booking liên quan).
 */
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `
      UPDATE \`trainer\` t
      INNER JOIN \`user\` u ON u.id = t.userId
      INNER JOIN \`gym\` g ON g.id = t.gymId
      SET t.isActive = 0
      WHERE g.name LIKE '%Vóc dáng vàng%'
        AND LOWER(TRIM(u.username)) IN ('giang', 'huy')
      `
    );
  },

  down: async () => {
    // Không bật lại tự động (tránh mở PT đã cố ý tắt sau này)
  },
};
