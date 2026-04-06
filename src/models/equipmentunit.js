'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EquipmentUnit extends Model {
    static associate(models) {
      EquipmentUnit.belongsTo(models.Equipment, {
        foreignKey: 'equipmentId',
        as: 'equipment',
      });

      EquipmentUnit.belongsTo(models.Gym, {
        foreignKey: 'gymId',
        as: 'gym',
      });

      if (models.Maintenance) {
        EquipmentUnit.hasMany(models.Maintenance, {
          foreignKey: 'equipmentUnitId',
          as: 'maintenanceRecords',
        });
      }

      if (models.EquipmentTransfer) {
        EquipmentUnit.belongsTo(models.EquipmentTransfer, {
          foreignKey: 'transferId',
          as: 'pendingTransfer',
        });
      }
    }
  }

  EquipmentUnit.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      equipmentId: { type: DataTypes.INTEGER, allowNull: false },
      gymId: { type: DataTypes.INTEGER, allowNull: false },
      assetCode: { type: DataTypes.STRING, allowNull: false, unique: true },
      serialNumber: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM('active', 'in_maintenance', 'transfer_pending', 'disposed'),
        allowNull: false,
        defaultValue: 'active',
      },
      usageStatus: {
        type: DataTypes.ENUM('in_stock', 'in_use'),
        allowNull: false,
        defaultValue: 'in_stock',
      },
      transferId: { type: DataTypes.INTEGER, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'EquipmentUnit',
      tableName: 'equipmentunit',
      freezeTableName: true,
      timestamps: true,
      indexes: [
        { fields: ['equipmentId'] },
        { fields: ['gymId'] },
        { fields: ['status'] },
        { fields: ['usageStatus'] },
        { fields: ['transferId'] },
      ],
    }
  );

  return EquipmentUnit;
};