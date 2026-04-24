'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const addColumnIfMissing = async (table, column, definition) => {
      const tableDesc = await queryInterface.describeTable(table);
      if (!tableDesc[column]) {
        await queryInterface.addColumn(table, column, definition);
      }
    };

    // ===== Phase 3: guide fields on equipment template =====
    await addColumnIfMissing("equipment", "usageGuide", { type: Sequelize.TEXT, allowNull: true });
    await addColumnIfMissing("equipment", "trainingInstructions", { type: Sequelize.TEXT, allowNull: true });
    await addColumnIfMissing("equipment", "muscleGroups", { type: Sequelize.TEXT, allowNull: true }); // JSON string or comma-separated
    await addColumnIfMissing("equipment", "safetyNotes", { type: Sequelize.TEXT, allowNull: true });
    await addColumnIfMissing("equipment", "guideImages", { type: Sequelize.TEXT, allowNull: true }); // JSON string (array of urls)
    await addColumnIfMissing("equipment", "guideVideoUrl", { type: Sequelize.STRING(512), allowNull: true });

    // ===== Phase 1 hardening: normalize equipment units =====
    // 1) normalize assetCode -> GFMS-EQ-000001 (do not change if already GFMS-EQ-xxxxxx)
    await queryInterface.sequelize.query(`
      UPDATE equipmentunit
      SET assetCode = CONCAT('GFMS-EQ-', LPAD(id, 6, '0'))
      WHERE assetCode IS NULL OR assetCode = '' OR assetCode NOT LIKE 'GFMS-EQ-%';
    `);

    // 2) backfill publicToken if missing (unique index exists; UUID per-row is safe enough)
    await queryInterface.sequelize.query(`
      UPDATE equipmentunit
      SET publicToken = REPLACE(UUID(), '-', '')
      WHERE publicToken IS NULL OR publicToken = '';
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("equipment", "guideVideoUrl").catch(() => {});
    await queryInterface.removeColumn("equipment", "guideImages").catch(() => {});
    await queryInterface.removeColumn("equipment", "safetyNotes").catch(() => {});
    await queryInterface.removeColumn("equipment", "muscleGroups").catch(() => {});
    await queryInterface.removeColumn("equipment", "trainingInstructions").catch(() => {});
    await queryInterface.removeColumn("equipment", "usageGuide").catch(() => {});
  },
};

