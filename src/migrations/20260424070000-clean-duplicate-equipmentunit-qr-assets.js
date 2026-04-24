'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();

    if (dialect !== 'mysql' && dialect !== 'mariadb') {
      console.warn('[clean-duplicate-equipmentunit-qr-assets] Skip: this migration is written for MySQL/MariaDB.');
      return;
    }

    // 1) Xoá EquipmentUnit không còn khớp với tồn kho thật.
    // Lỗi hiện tại: QR asset sinh nhiều hơn EquipmentStock.quantity hoặc asset của thiết bị không còn trong kho vẫn render ở Owner.
    await queryInterface.sequelize.query(`
      DELETE eu
      FROM equipmentunit eu
      LEFT JOIN equipmentstock es
        ON es.gymId = eu.gymId
       AND es.equipmentId = eu.equipmentId
      WHERE es.id IS NULL
         OR COALESCE(es.quantity, 0) <= 0
    `);

    // 2) Nếu 1 gym/equipment có nhiều EquipmentUnit hơn EquipmentStock.quantity,
    // giữ lại unit mới nhất, xoá unit dư để trang Tài sản QR khớp đúng số lượng thiết bị thật.
    await queryInterface.sequelize.query(`
      DELETE eu
      FROM equipmentunit eu
      JOIN (
        SELECT id
        FROM (
          SELECT
            eu2.id,
            ROW_NUMBER() OVER (
              PARTITION BY eu2.gymId, eu2.equipmentId
              ORDER BY COALESCE(eu2.deliveredAt, eu2.updatedAt, eu2.createdAt) DESC, eu2.id DESC
            ) AS rn,
            COALESCE(es.quantity, 0) AS stockQuantity
          FROM equipmentunit eu2
          JOIN equipmentstock es
            ON es.gymId = eu2.gymId
           AND es.equipmentId = eu2.equipmentId
        ) ranked
        WHERE ranked.rn > ranked.stockQuantity
      ) doomed ON doomed.id = eu.id
    `);
  },

  async down() {
    // Không rollback được vì đây là migration dọn dữ liệu rác/duplicate.
  },
};
