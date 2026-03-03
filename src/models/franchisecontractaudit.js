"use strict";

module.exports = (sequelize, DataTypes) => {
  const FranchiseContractAudit = sequelize.define(
    "FranchiseContractAudit",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      franchiseRequestId: { type: DataTypes.INTEGER, allowNull: false },
      documentId: { type: DataTypes.INTEGER, allowNull: true },

      eventType: { type: DataTypes.STRING(64), allowNull: false },
      actorRole: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "system" },

      ip: { type: DataTypes.STRING(64), allowNull: true },
      userAgent: { type: DataTypes.TEXT, allowNull: true },

      meta: { type: DataTypes.JSON, allowNull: true },
    },
    {
      tableName: "franchisecontractaudit",
      freezeTableName: true,
      timestamps: true,
    }
  );

  FranchiseContractAudit.associate = (models) => {
    if (models.FranchiseRequest) {
      FranchiseContractAudit.belongsTo(models.FranchiseRequest, {
        foreignKey: "franchiseRequestId",
        as: "franchiseRequest",
      });
    }
    if (models.FranchiseContractDocument) {
      FranchiseContractAudit.belongsTo(models.FranchiseContractDocument, { foreignKey: "documentId", as: "document" });
    }
  };

  return FranchiseContractAudit;
};
