"use strict";

/**
 * Mở rộng trạng thái PO cho flow cọc 30% / nhận hàng / thanh toán 70%.
 * Map giá trị ENUM cũ sang chuỗi mới.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE purchaseorder
      MODIFY COLUMN status VARCHAR(40) NOT NULL DEFAULT 'draft'
    `);
    await queryInterface.sequelize.query(`
      UPDATE purchaseorder SET status = CASE status
        WHEN 'pending' THEN 'draft'
        WHEN 'approved' THEN 'deposit_pending'
        WHEN 'ordered' THEN 'ordered'
        WHEN 'delivered' THEN 'received'
        WHEN 'cancelled' THEN 'cancelled'
        ELSE status
      END
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE purchaseorder SET status = CASE status
        WHEN 'draft' THEN 'pending'
        WHEN 'deposit_pending' THEN 'approved'
        WHEN 'deposit_paid' THEN 'approved'
        WHEN 'ordered' THEN 'ordered'
        WHEN 'partially_received' THEN 'ordered'
        WHEN 'received' THEN 'delivered'
        WHEN 'final_payment_pending' THEN 'delivered'
        WHEN 'completed' THEN 'delivered'
        WHEN 'cancelled' THEN 'cancelled'
        ELSE 'pending'
      END
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE purchaseorder
      MODIFY COLUMN status ENUM('pending','approved','ordered','delivered','cancelled')
      NOT NULL DEFAULT 'pending'
    `);
  },
};
