'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableName = 'request';

    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map(t => (typeof t === 'string' ? t : t.tableName));
    if (tableNames.includes(tableName)) return;

    await queryInterface.createTable(tableName, {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      requestType: {
        type: Sequelize.ENUM('LEAVE', 'SHIFT_CHANGE', 'TRANSFER_BRANCH', 'OVERTIME'),
        allowNull: false,
      },

      status: {
        type: Sequelize.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },

      requesterId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'user', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },

      approverId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'user', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },

      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      approveNote: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      data: {
        type: Sequelize.JSON,
        allowNull: true,
      },

      processedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex(tableName, ['requesterId'], { name: 'idx_request_requesterId' });
    await queryInterface.addIndex(tableName, ['status'], { name: 'idx_request_status' });
    await queryInterface.addIndex(tableName, ['requestType'], { name: 'idx_request_requestType' });
  },

  async down(queryInterface) {
    const tableName = 'request';

    try { await queryInterface.removeIndex(tableName, 'idx_request_requesterId'); } catch (e) {}
    try { await queryInterface.removeIndex(tableName, 'idx_request_status'); } catch (e) {}
    try { await queryInterface.removeIndex(tableName, 'idx_request_requestType'); } catch (e) {}

    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map(t => (typeof t === 'string' ? t : t.tableName));
    if (!tableNames.includes(tableName)) return;

    await queryInterface.dropTable(tableName);
  },
};
