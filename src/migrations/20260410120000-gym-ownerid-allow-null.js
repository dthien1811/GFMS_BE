"use strict";

/** Cho phép gym.ownerId = NULL (kho Admin hệ thống). Trước đây một số DB để NOT NULL nên INSERT lỗi 1048. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query("ALTER TABLE `gym` MODIFY COLUMN `ownerId` INT NULL");
  },

  async down() {
    // Không ép NOT NULL lại (dễ lỗi dữ liệu). Rollback thủ công nếu cần.
  },
};
