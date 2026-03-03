"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // ===== FranchiseContractDocuments =====
    await queryInterface.createTable("franchisecontractdocument", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },

      franchiseRequestId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },

      // file paths (relative to project root)
      originalPdfPath: { type: Sequelize.TEXT, allowNull: true },
      ownerSignedPdfPath: { type: Sequelize.TEXT, allowNull: true },
      finalPdfPath: { type: Sequelize.TEXT, allowNull: true },
      certificatePdfPath: { type: Sequelize.TEXT, allowNull: true },

      // hashes
      originalSha256: { type: Sequelize.STRING(64), allowNull: true },
      ownerSignedSha256: { type: Sequelize.STRING(64), allowNull: true },
      finalSha256: { type: Sequelize.STRING(64), allowNull: true },
      certificateSha256: { type: Sequelize.STRING(64), allowNull: true },

      isFrozen: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      meta: { type: Sequelize.JSON, allowNull: true },

      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("franchisecontractdocument", ["franchiseRequestId", "version"], {
      name: "idx_fcd_franchiseRequestId_version",
    });

    // FK to franchiserequest
    await queryInterface.addConstraint("franchisecontractdocument", {
      fields: ["franchiseRequestId"],
      type: "foreign key",
      name: "fk_fcd_franchiseRequestId",
      references: { table: "franchiserequest", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    // ===== FranchiseContractAudits =====
    await queryInterface.createTable("franchisecontractaudit", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },

      franchiseRequestId: { type: Sequelize.INTEGER, allowNull: false },
      documentId: { type: Sequelize.INTEGER, allowNull: true },

      eventType: { type: Sequelize.STRING(64), allowNull: false },
      actorRole: { type: Sequelize.STRING(32), allowNull: false, defaultValue: "system" },

      ip: { type: Sequelize.STRING(64), allowNull: true },
      userAgent: { type: Sequelize.TEXT, allowNull: true },

      meta: { type: Sequelize.JSON, allowNull: true },

      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("franchisecontractaudit", ["franchiseRequestId"], {
      name: "idx_fca_franchiseRequestId",
    });

    await queryInterface.addIndex("franchisecontractaudit", ["documentId"], {
      name: "idx_fca_documentId",
    });

    await queryInterface.addConstraint("franchisecontractaudit", {
      fields: ["franchiseRequestId"],
      type: "foreign key",
      name: "fk_fca_franchiseRequestId",
      references: { table: "franchiserequest", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.addConstraint("franchisecontractaudit", {
      fields: ["documentId"],
      type: "foreign key",
      name: "fk_fca_documentId",
      references: { table: "franchisecontractdocument", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface, Sequelize) {
    // drop audits first
    await queryInterface.dropTable("franchisecontractaudit");
    await queryInterface.dropTable("franchisecontractdocument");
  },
};
