"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class TrainerShareOverrideAudit extends Model {
    static associate(models) {
      TrainerShareOverrideAudit.belongsTo(models.TrainerShareOverride, {
        foreignKey: "overrideId",
        as: "override",
      });

      if (models.User) {
        TrainerShareOverrideAudit.belongsTo(models.User, {
          foreignKey: "actorId",
          as: "actor",
        });
      }
    }
  }

  TrainerShareOverrideAudit.init(
    {
      overrideId: DataTypes.INTEGER,
      action: DataTypes.STRING,
      oldValue: DataTypes.JSON,
      newValue: DataTypes.JSON,
      actorId: DataTypes.INTEGER,
      actorRole: DataTypes.STRING,
      createdAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: "TrainerShareOverrideAudit",
      tableName: "trainershareoverride_audit",
      updatedAt: false,
    }
  );

  return TrainerShareOverrideAudit;
};
