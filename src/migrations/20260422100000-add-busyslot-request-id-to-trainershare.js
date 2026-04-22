'use strict';

/** Migration: thêm cột busySlotRequestId vào bảng trainershare
 * Liên kết yêu cầu mượn PT với yêu cầu báo bận gốc (BUSY_SLOT request)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('trainershare');

    if (!table.busySlotRequestId) {
      await queryInterface.addColumn('trainershare', 'busySlotRequestId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Liên kết đến yêu cầu báo bận gốc (request.id) - khi owner chuyển sang luồng mượn PT',
      });

      // Thêm index để truy vấn nhanh theo busySlotRequestId
      await queryInterface.addIndex('trainershare', ['busySlotRequestId'], {
        name: 'trainershare_busySlotRequestId_idx',
        concurrently: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('trainershare');

    if (table.busySlotRequestId) {
      await queryInterface.removeIndex('trainershare', 'trainershare_busySlotRequestId_idx');
      await queryInterface.removeColumn('trainershare', 'busySlotRequestId');
    }
  },
};
