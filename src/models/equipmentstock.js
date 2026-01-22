// models/equipmentstock.js
"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class EquipmentStock extends Model {
    static associate(models) {
      EquipmentStock.belongsTo(models.Equipment, { foreignKey: "equipmentId", as: "equipment" });
      EquipmentStock.belongsTo(models.Gym, { foreignKey: "gymId", as: "gym" });
    }
  }

  EquipmentStock.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      equipmentId: { type: DataTypes.INTEGER, allowNull: false },
      gymId: { type: DataTypes.INTEGER, allowNull: false },

      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      reservedQuantity: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
      availableQuantity: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
      damagedQuantity: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
      maintenanceQuantity: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
      minStockLevel: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },

      location: { type: DataTypes.STRING, allowNull: true },
      reorderPoint: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 10 },
      lastRestocked: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: "EquipmentStock",
      tableName: "equipmentstock",
      freezeTableName: true,
      timestamps: true,
    }
  );

  return EquipmentStock;
};
