"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class EquipmentImage extends Model {
    static associate(models) {
      EquipmentImage.belongsTo(models.Equipment, { foreignKey: "equipmentId", as: "equipment" });
    }
  }

  EquipmentImage.init(
    {
      equipmentId: { type: DataTypes.INTEGER, allowNull: false },
      url: { type: DataTypes.STRING, allowNull: false },
      isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      altText: { type: DataTypes.STRING, allowNull: true },
    },
    {
      sequelize,
      modelName: "EquipmentImage",
      tableName: "equipmentimage",
      timestamps: true,
    }
  );

  return EquipmentImage;
};
