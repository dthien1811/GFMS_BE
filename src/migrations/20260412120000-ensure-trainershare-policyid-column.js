"use strict";

/**
 * Một số DB có bảng trainershare cũ thiếu cột policyId (lệch với model + migration 17).
 * Sequelize vẫn SELECT policyId khi join Policy → Unknown column 'TrainerShare.policyId'.
 * Migration này chỉ thêm cột nếu chưa có; không đổi luồng nghiệp vụ.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable("trainershare");
    const hasPolicyId = table.policyId ?? table.policyid;
    if (!hasPolicyId) {
      await queryInterface.addColumn("trainershare", "policyId", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  down: async () => {
    // Không gỡ cột: tránh rollback vô tình xóa policyId trên DB đã có cột từ migration gốc.
  },
};
