'use strict';

/**
 * Safe migration:
 * - DB đã có cột trainerId => skip (không lỗi Duplicate column)
 * - DB chưa có => addColumn + FK + index
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableName = 'package';
    const refTable = 'trainer';

    // Lấy cấu trúc bảng hiện tại
    const table = await queryInterface.describeTable(tableName);

    // Nếu đã có trainerId thì thôi
    if (table.trainerId) return;

    // Thêm cột trainerId + foreign key
    await queryInterface.addColumn(tableName, 'trainerId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: refTable, key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Thêm index để query nhanh
    await queryInterface.addIndex(tableName, ['trainerId'], {
      name: 'idx_package_trainerId',
    });
  },

  async down(queryInterface) {
    const tableName = 'package';

    const table = await queryInterface.describeTable(tableName);
    if (!table.trainerId) return;

    // Remove index (try/catch tránh lỗi nếu DB đặt tên index khác)
    try {
      await queryInterface.removeIndex(tableName, 'idx_package_trainerId');
    } catch (e) {
      try {
        await queryInterface.removeIndex(tableName, ['trainerId']);
      } catch (e2) {
        // ignore
      }
    }

    // Remove column (MySQL sẽ tự drop FK constraint nếu có)
    await queryInterface.removeColumn(tableName, 'trainerId');
  },
};
