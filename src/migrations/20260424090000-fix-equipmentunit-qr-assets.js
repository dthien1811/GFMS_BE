'use strict';

const crypto = require('crypto');

const TABLE_UNIT = 'equipmentunit';
const TABLE_EQUIPMENT = 'equipment';
const FRONTEND_URL = String(process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');

const hasColumn = async (queryInterface, table, column) => {
  const desc = await queryInterface.describeTable(table);
  return Boolean(desc[column]);
};

const addColumnIfMissing = async (queryInterface, Sequelize, table, column, definition) => {
  if (!(await hasColumn(queryInterface, table, column))) {
    await queryInterface.addColumn(table, column, definition);
  }
};

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await addColumnIfMissing(queryInterface, Sequelize, TABLE_UNIT, 'ownerId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'gymId',
    });
    await addColumnIfMissing(queryInterface, Sequelize, TABLE_UNIT, 'purchaseRequestId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'ownerId',
    });
    await addColumnIfMissing(queryInterface, Sequelize, TABLE_UNIT, 'comboId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'purchaseRequestId',
    });
    await addColumnIfMissing(queryInterface, Sequelize, TABLE_UNIT, 'publicToken', {
      type: Sequelize.STRING(80),
      allowNull: true,
      unique: true,
      after: 'assetCode',
    });
    await addColumnIfMissing(queryInterface, Sequelize, TABLE_UNIT, 'qrUrl', {
      type: Sequelize.STRING(512),
      allowNull: true,
      after: 'publicToken',
    });
    await addColumnIfMissing(queryInterface, Sequelize, TABLE_UNIT, 'deliveredAt', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'transferId',
    });

    await addColumnIfMissing(queryInterface, Sequelize, TABLE_EQUIPMENT, 'usageGuide', { type: Sequelize.TEXT, allowNull: true });
    await addColumnIfMissing(queryInterface, Sequelize, TABLE_EQUIPMENT, 'trainingInstructions', { type: Sequelize.TEXT, allowNull: true });
    await addColumnIfMissing(queryInterface, Sequelize, TABLE_EQUIPMENT, 'muscleGroups', { type: Sequelize.JSON, allowNull: true });
    await addColumnIfMissing(queryInterface, Sequelize, TABLE_EQUIPMENT, 'safetyNotes', { type: Sequelize.TEXT, allowNull: true });
    await addColumnIfMissing(queryInterface, Sequelize, TABLE_EQUIPMENT, 'guideImages', { type: Sequelize.JSON, allowNull: true });
    await addColumnIfMissing(queryInterface, Sequelize, TABLE_EQUIPMENT, 'guideVideoUrl', { type: Sequelize.STRING(512), allowNull: true });

    try {
      await queryInterface.changeColumn(TABLE_UNIT, 'status', {
        type: Sequelize.ENUM('active', 'in_maintenance', 'maintenance', 'broken', 'transfer_pending', 'disposed', 'retired'),
        allowNull: false,
        defaultValue: 'active',
      });
    } catch (e) {
      // MySQL enum may already be compatible; do not block migration.
      console.warn('[migration] skip status enum change:', e.message);
    }

    await queryInterface.sequelize.query(`
      UPDATE ${TABLE_UNIT} eu
      JOIN gym g ON g.id = eu.gymId
      SET eu.ownerId = g.ownerId
      WHERE eu.ownerId IS NULL
    `);

    const [rows] = await queryInterface.sequelize.query(`SELECT id, assetCode, publicToken, qrUrl FROM ${TABLE_UNIT} ORDER BY id ASC`);
    let seq = 1;
    const seenCodes = new Set();
    const seenTokens = new Set();
    for (const row of rows) {
      let code = String(row.assetCode || '');
      if (!/^GFMS-EQ-\d{6}$/.test(code) || seenCodes.has(code)) {
        code = `GFMS-EQ-${String(seq).padStart(6, '0')}`;
        while (seenCodes.has(code)) {
          seq += 1;
          code = `GFMS-EQ-${String(seq).padStart(6, '0')}`;
        }
      }
      seenCodes.add(code);
      seq += 1;

      let token = String(row.publicToken || '');
      if (!token || seenTokens.has(token)) token = crypto.randomBytes(24).toString('base64url');
      while (seenTokens.has(token)) token = crypto.randomBytes(24).toString('base64url');
      seenTokens.add(token);
      const qrUrl = `${FRONTEND_URL}/equipment/scan/${token}`;

      await queryInterface.sequelize.query(
        `UPDATE ${TABLE_UNIT} SET assetCode = ?, publicToken = ?, qrUrl = ?, deliveredAt = COALESCE(deliveredAt, createdAt) WHERE id = ?`,
        { replacements: [code, token, qrUrl, row.id] }
      );
    }

    // Cleanup duplicate unit rows created before purchaseRequestId/idempotent logic existed.
    // Rule: for each gym/equipment, keep newest N active rows where N = equipmentstock.quantity.
    const [groups] = await queryInterface.sequelize.query(`
      SELECT eu.gymId, eu.equipmentId, COUNT(*) AS unitCount, COALESCE(es.quantity, 0) AS stockQty
      FROM ${TABLE_UNIT} eu
      LEFT JOIN equipmentstock es ON es.gymId = eu.gymId AND es.equipmentId = eu.equipmentId
      WHERE eu.status IN ('active','in_maintenance','maintenance','broken')
      GROUP BY eu.gymId, eu.equipmentId, es.quantity
      HAVING unitCount > stockQty AND stockQty >= 0
    `);

    for (const group of groups) {
      const keep = Number(group.stockQty || 0);
      const [unitRows] = await queryInterface.sequelize.query(
        `SELECT id FROM ${TABLE_UNIT} WHERE gymId = ? AND equipmentId = ? AND status IN ('active','in_maintenance','maintenance','broken') ORDER BY updatedAt DESC, id DESC`,
        { replacements: [group.gymId, group.equipmentId] }
      );
      const deleteIds = unitRows.slice(keep).map((r) => r.id).filter(Boolean);
      if (deleteIds.length) {
        await queryInterface.sequelize.query(`DELETE FROM ${TABLE_UNIT} WHERE id IN (${deleteIds.map(() => '?').join(',')})`, { replacements: deleteIds });
      }
    }

    const indexes = [
      ['idx_equipmentunit_owner', ['ownerId']],
      ['idx_equipmentunit_purchase_request', ['purchaseRequestId']],
      ['idx_equipmentunit_combo', ['comboId']],
      ['idx_equipmentunit_public_token', ['publicToken']],
    ];
    for (const [name, fields] of indexes) {
      try { await queryInterface.addIndex(TABLE_UNIT, fields, { name }); } catch (e) {}
    }
  },

  down: async (queryInterface) => {
    const columns = ['guideVideoUrl', 'guideImages', 'safetyNotes', 'muscleGroups', 'trainingInstructions', 'usageGuide'];
    for (const col of columns) {
      if (await hasColumn(queryInterface, TABLE_EQUIPMENT, col)) await queryInterface.removeColumn(TABLE_EQUIPMENT, col);
    }
    const unitCols = ['deliveredAt', 'qrUrl', 'publicToken', 'comboId', 'purchaseRequestId', 'ownerId'];
    for (const col of unitCols) {
      if (await hasColumn(queryInterface, TABLE_UNIT, col)) await queryInterface.removeColumn(TABLE_UNIT, col);
    }
  },
};
