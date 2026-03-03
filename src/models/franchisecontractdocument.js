"use strict";

module.exports = (sequelize, DataTypes) => {
  const FranchiseContractDocument = sequelize.define(
    "FranchiseContractDocument",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      franchiseRequestId: { type: DataTypes.INTEGER, allowNull: false },

      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },

      originalPdfPath: { type: DataTypes.TEXT, allowNull: true },
      ownerSignedPdfPath: { type: DataTypes.TEXT, allowNull: true },
      finalPdfPath: { type: DataTypes.TEXT, allowNull: true },
      certificatePdfPath: { type: DataTypes.TEXT, allowNull: true },

      originalSha256: { type: DataTypes.STRING(64), allowNull: true },
      ownerSignedSha256: { type: DataTypes.STRING(64), allowNull: true },
      finalSha256: { type: DataTypes.STRING(64), allowNull: true },
      certificateSha256: { type: DataTypes.STRING(64), allowNull: true },

      isFrozen: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      meta: { type: DataTypes.JSON, allowNull: true },
    },
    {
      tableName: "franchisecontractdocument",
      freezeTableName: true,
      timestamps: true,
    }
  );

  FranchiseContractDocument.associate = (models) => {
    if (models.FranchiseRequest) {
      FranchiseContractDocument.belongsTo(models.FranchiseRequest, {
        foreignKey: "franchiseRequestId",
        as: "franchiseRequest",
      });
    }
    if (models.FranchiseContractAudit) {
      FranchiseContractDocument.hasMany(models.FranchiseContractAudit, { foreignKey: "documentId", as: "audits" });
    }
  };

  return FranchiseContractDocument;
};
