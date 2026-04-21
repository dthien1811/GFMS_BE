'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [supplierRows] = await queryInterface.sequelize.query(`SELECT id FROM supplier ORDER BY id ASC LIMIT 1`);
    const supplierId = supplierRows?.[0]?.id || null;
    const [equipmentRows] = await queryInterface.sequelize.query(`SELECT id, name FROM equipment ORDER BY id ASC LIMIT 9`);
    if (!equipmentRows || equipmentRows.length < 3) {
      console.log('[Seeder] Bỏ qua combo demo vì chưa có đủ equipment.');
      return;
    }

    const combos = [
      { name: 'Combo cơ bản', code: 'COMBO-CO-BAN', description: 'Combo khởi động cho phòng gym mới.', price: 30000000 },
      { name: 'Combo nâng cao', code: 'COMBO-NANG-CAO', description: 'Combo mở rộng cho gym đang tăng trưởng.', price: 60000000 },
      { name: 'Combo cao cấp', code: 'COMBO-CAO-CAP', description: 'Combo full setup enterprise.', price: 100000000 },
    ];

    const existing = await queryInterface.sequelize.query(`SELECT code FROM equipment_combo WHERE code IN ('COMBO-CO-BAN','COMBO-NANG-CAO','COMBO-CAO-CAP')`);
    const existingCodes = new Set((existing?.[0] || []).map((row) => row.code));
    const comboRows = combos
      .filter((combo) => !existingCodes.has(combo.code))
      .map((combo) => ({
        ...combo,
        status: 'active',
        thumbnail: null,
        supplierId,
        isSelling: true,
        createdAt: now,
        updatedAt: now,
      }));

    if (comboRows.length) {
      await queryInterface.bulkInsert('equipment_combo', comboRows);
    }

    const [createdCombos] = await queryInterface.sequelize.query(`SELECT id, code FROM equipment_combo WHERE code IN ('COMBO-CO-BAN','COMBO-NANG-CAO','COMBO-CAO-CAP') ORDER BY id ASC`);
    const comboMap = new Map(createdCombos.map((row) => [row.code, row.id]));

    const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
    const equipmentChunks = chunk(equipmentRows, 3);
    const itemRows = [];

    ['COMBO-CO-BAN', 'COMBO-NANG-CAO', 'COMBO-CAO-CAP'].forEach((code, comboIndex) => {
      const comboId = comboMap.get(code);
      if (!comboId) return;
      const items = equipmentChunks[comboIndex] || equipmentRows.slice(0, 3);
      items.forEach((equipment, index) => {
        itemRows.push({
          comboId,
          equipmentId: equipment.id,
          quantity: comboIndex + index + 1,
          note: `Thiết bị mẫu: ${equipment.name || `#${equipment.id}`}`,
          sortOrder: index + 1,
          createdAt: now,
          updatedAt: now,
        });
      });
    });

    if (itemRows.length) {
      await queryInterface.bulkInsert('equipment_combo_item', itemRows);
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DELETE FROM equipment_combo_item WHERE comboId IN (SELECT id FROM equipment_combo WHERE code IN ('COMBO-CO-BAN','COMBO-NANG-CAO','COMBO-CAO-CAP'))`);
    await queryInterface.bulkDelete('equipment_combo', { code: ['COMBO-CO-BAN', 'COMBO-NANG-CAO', 'COMBO-CAO-CAP'] });
  },
};
