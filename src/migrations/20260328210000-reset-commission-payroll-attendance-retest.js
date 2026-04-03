"use strict";

/**
 * Reset môi trường test luồng thanh toán PT (MySQL/MariaDB):
 * - Xóa sessionprogress, commission, payrollitem, payrollperiod, attendance, withdrawal
 * - Booking completed/in_progress → confirmed (điểm danh & thanh toán lại từ đầu)
 * - trainer.pendingCommission = 0, lastPayoutDate = NULL
 * - Đồng bộ sessionsUsed / sessionsRemaining trên packageactivation
 */
module.exports = {
  up: async (queryInterface) => {
    const { sequelize } = queryInterface;
    const dialect = sequelize.getDialect();
    if (dialect !== "mysql" && dialect !== "mariadb") {
      throw new Error(
        "Migration 20260328210000-reset-commission-payroll-attendance-retest chỉ chạy trên MySQL/MariaDB."
      );
    }

    await sequelize.transaction(async (transaction) => {
      const q = (sql) => sequelize.query(sql, { transaction });

      await q("DELETE FROM sessionprogress");
      await q("DELETE FROM commission");
      await q("DELETE FROM payrollitem");
      await q("DELETE FROM payrollperiod");
      await q("DELETE FROM attendance");
      await q("DELETE FROM withdrawal");

      await q(
        "UPDATE booking SET status = 'confirmed', checkinTime = NULL, checkoutTime = NULL WHERE status IN ('completed', 'in_progress')"
      );

      await q("UPDATE trainer SET pendingCommission = 0, lastPayoutDate = NULL");

      await q(`
        UPDATE packageactivation pa
        LEFT JOIN (
          SELECT packageActivationId AS pid, COUNT(*) AS done
          FROM booking
          WHERE status IN ('in_progress', 'completed') AND packageActivationId IS NOT NULL
          GROUP BY packageActivationId
        ) d ON d.pid = pa.id
        SET
          pa.sessionsUsed = IFNULL(d.done, 0),
          pa.sessionsRemaining = GREATEST(0, IFNULL(pa.totalSessions, 0) - IFNULL(d.done, 0)),
          pa.status = CASE
            WHEN IFNULL(pa.totalSessions, 0) - IFNULL(d.done, 0) <= 0 THEN 'completed'
            ELSE 'active'
          END
      `);

      try {
        await q("UPDATE booking SET commissionCalculated = 0");
      } catch {
        /* cột có thể không có */
      }
    });
  },

  down: async () => {},
};
