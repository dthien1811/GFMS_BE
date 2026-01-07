'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EquipmentStock extends Model {
    static associate(models) {
      EquipmentStock.belongsTo(models.Equipment, { foreignKey: 'equipmentId', as: 'equipment' });
      EquipmentStock.belongsTo(models.Gym, { foreignKey: 'gymId', as: 'gym' });
    }
  }

  EquipmentStock.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      equipmentId: { type: DataTypes.INTEGER, allowNull: false },
      gymId: { type: DataTypes.INTEGER, allowNull: false },

      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      reservedQuantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      availableQuantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

      // ✅ NEW (Cách A)
      damagedQuantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      maintenanceQuantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

      location: { type: DataTypes.STRING, allowNull: true },
      reorderPoint: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 10 },
      lastRestocked: { type: DataTypes.DATE, allowNull: true },

      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      modelName: 'EquipmentStock',
      tableName: 'EquipmentStock',
      timestamps: true,
    }
  );

  return EquipmentStock;
};
