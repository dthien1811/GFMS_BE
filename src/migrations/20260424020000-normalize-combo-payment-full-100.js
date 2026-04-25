'use strict';

module.exports = {
  async up(queryInterface) {
    // Normalize legacy 30/70 fields for combo purchase flow.
    // Business: combo is paid 100% once. remainingAmount = totalAmount before payment, 0 after payment success.
    // We infer "paid" by status (paid_waiting_admin_confirm/shipping/completed) OR completed payment transactions.

    await queryInterface.sequelize.query(`
      UPDATE purchaserequest pr
      SET
        pr.totalAmount = COALESCE(pr.totalAmount, pr.payableAmount, pr.quantity * pr.expectedUnitPrice, 0),
        pr.depositAmount = 0,
        pr.finalAmount = COALESCE(pr.totalAmount, pr.payableAmount, pr.quantity * pr.expectedUnitPrice, 0),
        pr.remainingAmount = CASE
          WHEN pr.status IN ('paid_waiting_admin_confirm','shipping','completed') THEN 0
          WHEN EXISTS (
            SELECT 1
            FROM \`transaction\` tx
            WHERE tx.purchaseRequestId = pr.id
              AND tx.transactionType = 'equipment_purchase'
              AND LOWER(tx.paymentStatus) = 'completed'
          ) THEN 0
          ELSE COALESCE(pr.totalAmount, pr.payableAmount, pr.quantity * pr.expectedUnitPrice, 0)
        END
      WHERE pr.comboId IS NOT NULL;
    `);

    await queryInterface.sequelize.query(`
      UPDATE \`transaction\` tx
      SET tx.paymentPhase = 'full'
      WHERE tx.purchaseRequestId IS NOT NULL
        AND tx.transactionType = 'equipment_purchase'
        AND (tx.paymentPhase IS NULL OR tx.paymentPhase IN ('deposit','final'));
    `);
  },

  async down() {
    // No-op: cannot reliably restore historical 30/70 split.
  },
};

