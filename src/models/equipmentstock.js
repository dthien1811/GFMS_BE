'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EquipmentStock extends Model {
    static associate(models) {
      EquipmentStock.belongsTo(models.Equipment, { foreignKey: 'equipmentId' });
      EquipmentStock.belongsTo(models.Gym, { foreignKey: 'gymId' });
    }
  }

  EquipmentStock.init(
    {
      equipmentId: { type: DataTypes.INTEGER, allowNull: false },
      gymId: { type: DataTypes.INTEGER, allowNull: false },
      quantity: { type: DataTypes.INTEGER, defaultValue: 0 },
      reservedQuantity: { type: DataTypes.INTEGER, defaultValue: 0 },
      availableQuantity: { type: DataTypes.INTEGER, defaultValue: 0 },
      location: DataTypes.STRING,
      reorderPoint: DataTypes.INTEGER,
      lastRestocked: DataTypes.DATE,
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'EquipmentStock',
      tableName: 'equipmentstock',
      timestamps: true,
      indexes: [{ unique: true, fields: ['equipmentId', 'gymId'] }],
    }
  );

  return EquipmentStock;
};
