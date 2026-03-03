"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class TrainerShareOverride extends Model {
    static associate(models) {
      TrainerShareOverride.belongsTo(models.TrainerShare, {
        foreignKey: "trainerShareId",
        as: "trainerShare",
      });

      // policy optional
      if (models.Policy) {
        TrainerShareOverride.belongsTo(models.Policy, {
          foreignKey: "policyId",
          as: "policy",
        });
      }

      if (models.User) {
        TrainerShareOverride.belongsTo(models.User, { foreignKey: "createdBy", as: "creator" });
        TrainerShareOverride.belongsTo(models.User, { foreignKey: "updatedBy", as: "updater" });

        // enterprise
        TrainerShareOverride.belongsTo(models.User, { foreignKey: "approvedBy", as: "approver" });
        TrainerShareOverride.belongsTo(models.User, { foreignKey: "revokedBy", as: "revoker" });
      }

      if (models.TrainerShareOverrideAudit) {
        TrainerShareOverride.hasMany(models.TrainerShareOverrideAudit, {
          foreignKey: "overrideId",
          as: "audits",
        });
      }
    }
  }

  TrainerShareOverride.init(
    {
      trainerShareId: DataTypes.INTEGER,
      policyId: DataTypes.INTEGER,
      commissionSplit: DataTypes.FLOAT,

      effectiveFrom: DataTypes.DATE,
      effectiveTo: DataTypes.DATE,

      // legacy toggle (keep for backward compatibility)
      isActive: DataTypes.BOOLEAN,

      // ✅ enterprise status
      status: DataTypes.STRING, // PENDING | APPROVED | REVOKED | EXPIRED
      approvedBy: DataTypes.INTEGER,
      approvedAt: DataTypes.DATE,
      revokedBy: DataTypes.INTEGER,
      revokedAt: DataTypes.DATE,
      expiredAt: DataTypes.DATE,

      notes: DataTypes.TEXT,
      createdBy: DataTypes.INTEGER,
      updatedBy: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: "TrainerShareOverride",
      tableName: "trainershareoverride",
    }
  );

  return TrainerShareOverride;
};
