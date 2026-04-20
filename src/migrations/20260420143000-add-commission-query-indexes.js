"use strict";

/** Tối ưu truy vấn phân trang/đếm commission cho owner/commissions */
module.exports = {
  async up(queryInterface) {
    try {
      await queryInterface.addIndex("commission", ["gymId", "sessionDate", "createdAt"], {
        name: "idx_commission_gym_session_created",
      });
    } catch (_e) {}

    try {
      await queryInterface.addIndex("commission", ["gymId", "status", "sessionDate"], {
        name: "idx_commission_gym_status_session",
      });
    } catch (_e) {}

    try {
      await queryInterface.addIndex("commission", ["bookingId", "payee"], {
        name: "idx_commission_booking_payee",
      });
    } catch (_e) {}
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeIndex("commission", "idx_commission_gym_session_created");
    } catch (_e) {}
    try {
      await queryInterface.removeIndex("commission", "idx_commission_gym_status_session");
    } catch (_e) {}
    try {
      await queryInterface.removeIndex("commission", "idx_commission_booking_payee");
    } catch (_e) {}
  },
};

