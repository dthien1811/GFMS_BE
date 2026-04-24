'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const addColumnIfMissing = async (table, column, definition) => {
      const tableDesc = await queryInterface.describeTable(table);
      if (!tableDesc[column]) {
        await queryInterface.addColumn(table, column, definition);
      }
    };

    await addColumnIfMissing('equipmentunit', 'publicToken', {
      type: Sequelize.STRING(64),
      allowNull: true,
      unique: true,
      after: 'assetCode',
    });

    await addColumnIfMissing('equipmentunit', 'qrUrl', {
      type: Sequelize.TEXT,
      allowNull: true,
      after: 'publicToken',
    });

    await addColumnIfMissing('equipmentunit', 'purchaseRequestId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'purchaserequest', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      after: 'transferId',
    });

    await addColumnIfMissing('equipmentunit', 'comboId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'equipment_combo', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      after: 'purchaseRequestId',
    });

    await addColumnIfMissing('equipmentunit', 'ownerId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'user', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      after: 'comboId',
    });

    await addColumnIfMissing('equipmentunit', 'deliveredAt', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'ownerId',
    });

    await addColumnIfMissing('equipmentunit', 'lifecycleStatus', {
      type: Sequelize.ENUM('active', 'maintenance', 'broken', 'retired'),
      allowNull: false,
      defaultValue: 'active',
      after: 'usageStatus',
    });

    // indexes (idempotent-ish: wrap in try/catch because mysql may throw if exists)
    await queryInterface.addIndex('equipmentunit', ['purchaseRequestId'], { name: 'equipmentunit_purchase_request_idx' }).catch(() => {});
    await queryInterface.addIndex('equipmentunit', ['comboId'], { name: 'equipmentunit_combo_idx' }).catch(() => {});
    await queryInterface.addIndex('equipmentunit', ['ownerId'], { name: 'equipmentunit_owner_idx' }).catch(() => {});
    await queryInterface.addIndex('equipmentunit', ['lifecycleStatus'], { name: 'equipmentunit_lifecycle_status_idx' }).catch(() => {});
    await queryInterface.addIndex('equipmentunit', ['publicToken'], { name: 'equipmentunit_public_token_idx', unique: true }).catch(() => {});
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('equipmentunit', 'equipmentunit_public_token_idx').catch(() => {});
    await queryInterface.removeIndex('equipmentunit', 'equipmentunit_lifecycle_status_idx').catch(() => {});
    await queryInterface.removeIndex('equipmentunit', 'equipmentunit_owner_idx').catch(() => {});
    await queryInterface.removeIndex('equipmentunit', 'equipmentunit_combo_idx').catch(() => {});
    await queryInterface.removeIndex('equipmentunit', 'equipmentunit_purchase_request_idx').catch(() => {});

    await queryInterface.removeColumn('equipmentunit', 'lifecycleStatus').catch(() => {});
    await queryInterface.removeColumn('equipmentunit', 'deliveredAt').catch(() => {});
    await queryInterface.removeColumn('equipmentunit', 'ownerId').catch(() => {});
    await queryInterface.removeColumn('equipmentunit', 'comboId').catch(() => {});
    await queryInterface.removeColumn('equipmentunit', 'purchaseRequestId').catch(() => {});
    await queryInterface.removeColumn('equipmentunit', 'qrUrl').catch(() => {});
    await queryInterface.removeColumn('equipmentunit', 'publicToken').catch(() => {});
  },
};

