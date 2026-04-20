"use strict";

/** Tối ưu timeout cho owner transactions/withdrawals/purchase-requests */
module.exports = {
  async up(queryInterface) {
    // transaction
    try {
      await queryInterface.addIndex("transaction", ["gymId", "transactionType", "transactionDate"], {
        name: "idx_tx_gym_type_txdate",
      });
    } catch (_e) {}
    try {
      await queryInterface.addIndex("transaction", ["gymId", "paymentStatus", "createdAt"], {
        name: "idx_tx_gym_paystatus_created",
      });
    } catch (_e) {}
    try {
      await queryInterface.addIndex("transaction", ["transactionCode"], {
        name: "idx_tx_code",
      });
    } catch (_e) {}

    // withdrawal
    try {
      await queryInterface.addIndex("withdrawal", ["status", "createdAt"], {
        name: "idx_withdrawal_status_created",
      });
    } catch (_e) {}
    try {
      await queryInterface.addIndex("withdrawal", ["trainerId", "status", "createdAt"], {
        name: "idx_withdrawal_trainer_status_created",
      });
    } catch (_e) {}

    // purchase request
    try {
      await queryInterface.addIndex("purchaserequest", ["gymId", "status", "createdAt"], {
        name: "idx_pr_gym_status_created",
      });
    } catch (_e) {}
    try {
      await queryInterface.addIndex("purchaserequest", ["code"], {
        name: "idx_pr_code",
      });
    } catch (_e) {}
  },

  async down(queryInterface) {
    try { await queryInterface.removeIndex("transaction", "idx_tx_gym_type_txdate"); } catch (_e) {}
    try { await queryInterface.removeIndex("transaction", "idx_tx_gym_paystatus_created"); } catch (_e) {}
    try { await queryInterface.removeIndex("transaction", "idx_tx_code"); } catch (_e) {}

    try { await queryInterface.removeIndex("withdrawal", "idx_withdrawal_status_created"); } catch (_e) {}
    try { await queryInterface.removeIndex("withdrawal", "idx_withdrawal_trainer_status_created"); } catch (_e) {}

    try { await queryInterface.removeIndex("purchaserequest", "idx_pr_gym_status_created"); } catch (_e) {}
    try { await queryInterface.removeIndex("purchaserequest", "idx_pr_code"); } catch (_e) {}
  },
};

