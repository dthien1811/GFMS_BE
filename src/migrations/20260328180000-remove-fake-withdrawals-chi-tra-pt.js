"use strict";

/**
 * Xóa các bản ghi withdrawal giả: ghi chú dạng "Chi trả theo PT (...)"
 * (không phải yêu cầu rút ngân hàng của PT).
 */
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      "DELETE FROM withdrawal WHERE notes LIKE 'Chi trả theo PT (%'"
    );
  },

  down: async () => {
    // Không khôi phục được dữ liệu đã xóa
  },
};
