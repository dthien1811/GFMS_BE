"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // ========== 1) ADD ENTERPRISE COLUMNS ==========
    const table = "trainershareoverride";

    const tableDesc = await queryInterface.describeTable(table).catch(() => null);
    if (!tableDesc) throw new Error(`Table ${table} not found. Run 18b first.`);

    // status: PENDING | APPROVED | REVOKED | EXPIRED
    if (!tableDesc.status) {
      await queryInterface.addColumn(table, "status", {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: "PENDING",
      });
      await queryInterface.addIndex(table, ["status"]);
    }

    if (!tableDesc.approvedBy) {
      await queryInterface.addColumn(table, "approvedBy", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
      await queryInterface.addIndex(table, ["approvedBy"]);
    }

    if (!tableDesc.approvedAt) {
      await queryInterface.addColumn(table, "approvedAt", {
        type: Sequelize.DATE,
        allowNull: true,
      });
      await queryInterface.addIndex(table, ["approvedAt"]);
    }

    if (!tableDesc.revokedBy) {
      await queryInterface.addColumn(table, "revokedBy", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
      await queryInterface.addIndex(table, ["revokedBy"]);
    }

    if (!tableDesc.revokedAt) {
      await queryInterface.addColumn(table, "revokedAt", {
        type: Sequelize.DATE,
        allowNull: true,
      });
      await queryInterface.addIndex(table, ["revokedAt"]);
    }

    if (!tableDesc.expiredAt) {
      await queryInterface.addColumn(table, "expiredAt", {
        type: Sequelize.DATE,
        allowNull: true,
      });
      await queryInterface.addIndex(table, ["expiredAt"]);
    }

    // ========== 2) CREATE AUDIT TABLE ==========
    const auditTable = "trainershareoverride_audit";
    const auditDesc = await queryInterface.describeTable(auditTable).catch(() => null);

    if (!auditDesc) {
      await queryInterface.createTable(auditTable, {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },

        overrideId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "trainershareoverride", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },

        action: {
          type: Sequelize.STRING(32),
          allowNull: false, // CREATE | UPDATE | APPROVE | REVOKE | EXPIRE | TOGGLE
        },

        oldValue: { type: Sequelize.JSON, allowNull: true },
        newValue: { type: Sequelize.JSON, allowNull: true },

        actorId: { type: Sequelize.INTEGER, allowNull: true },
        actorRole: { type: Sequelize.STRING(64), allowNull: true },

        createdAt: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      });

      await queryInterface.addIndex(auditTable, ["overrideId"]);
      await queryInterface.addIndex(auditTable, ["action"]);
      await queryInterface.addIndex(auditTable, ["actorId"]);
      await queryInterface.addIndex(auditTable, ["createdAt"]);
    }

    // ========== 3) DATA BACKFILL (SAFE) ==========
    // Nếu bạn đã có override active trước đó: set status = APPROVED
    // (để không làm mất hiệu lực override cũ)
    await queryInterface.sequelize.query(`
      UPDATE trainershareoverride
      SET status = 'APPROVED', approvedAt = COALESCE(approvedAt, createdAt)
      WHERE (status IS NULL OR status = 'PENDING') AND isActive = 1
    `);
  },

  down: async (queryInterface, Sequelize) => {
    const table = "trainershareoverride";
    const auditTable = "trainershareoverride_audit";

    // drop audit table first
    await queryInterface.dropTable(auditTable).catch(() => null);

    // remove columns (best-effort)
    const desc = await queryInterface.describeTable(table).catch(() => null);
    if (!desc) return;

    const dropIfExists = async (col) => {
      if (desc[col]) {
        await queryInterface.removeColumn(table, col).catch(() => null);
      }
    };

    await dropIfExists("status");
    await dropIfExists("approvedBy");
    await dropIfExists("approvedAt");
    await dropIfExists("revokedBy");
    await dropIfExists("revokedAt");
    await dropIfExists("expiredAt");
  },
};