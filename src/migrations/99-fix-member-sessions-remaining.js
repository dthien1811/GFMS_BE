'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Cập nhật sessionsRemaining từ package cho các member đã có gói
    await queryInterface.sequelize.query(`
      UPDATE member m
      INNER JOIN package p ON m.currentPackageId = p.id
      SET m.sessionsRemaining = p.sessions
      WHERE m.currentPackageId IS NOT NULL
      AND (m.sessionsRemaining IS NULL OR m.sessionsRemaining = 0)
    `);

    // Cập nhật packageExpiryDate từ package durationDays cho các member chưa có expiryDate
    await queryInterface.sequelize.query(`
      UPDATE member m
      INNER JOIN package p ON m.currentPackageId = p.id
      SET m.packageExpiryDate = DATE_ADD(m.joinDate, INTERVAL p.durationDays DAY)
      WHERE m.currentPackageId IS NOT NULL
      AND m.packageExpiryDate IS NULL
      AND p.durationDays IS NOT NULL
      AND p.durationDays > 0
    `);

    // Set sessionsRemaining = 0 cho member không có gói
    await queryInterface.sequelize.query(`
      UPDATE member
      SET sessionsRemaining = 0
      WHERE currentPackageId IS NULL
      AND sessionsRemaining IS NULL
    `);
  },

  async down(queryInterface, Sequelize) {
    // Không cần rollback vì đây là fix data
  }
};
