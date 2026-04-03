"use strict";

/** Xóa toàn bộ bản ghi withdrawal (dữ liệu demo / ảo trên trang chủ gym). */
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query("DELETE FROM withdrawal");
  },

  down: async () => {
    // Không khôi phục
  },
};
