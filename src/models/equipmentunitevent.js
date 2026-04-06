'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EquipmentUnitEvent extends Model {
    static associate(models) {
      EquipmentUnitEvent.belongsTo(models.EquipmentUnit, {
        foreignKey: 'equipmentUnitId',
        as: 'unit',
      });

      EquipmentUnitEvent.belongsTo(models.Equipment, {
        foreignKey: 'equipmentId',
        as: 'equipment',
      });

      EquipmentUnitEvent.belongsTo(models.Gym, {
        foreignKey: 'gymId',
        as: 'gym',
      });

      EquipmentUnitEvent.belongsTo(models.Gym, {
        foreignKey: 'fromGymId',
        as: 'fromGym',
      });

      EquipmentUnitEvent.belongsTo(models.Gym, {
        foreignKey: 'toGymId',
        as: 'toGym',
      });

      EquipmentUnitEvent.belongsTo(models.User, {
        foreignKey: 'performedBy',
        as: 'actor',
      });
    }
  }

  EquipmentUnitEvent.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      equipmentUnitId: { type: DataTypes.INTEGER, allowNull: false },
      equipmentId: { type: DataTypes.INTEGER, allowNull: false },
      gymId: { type: DataTypes.INTEGER, allowNull: true },
      fromGymId: { type: DataTypes.INTEGER, allowNull: true },
      toGymId: { type: DataTypes.INTEGER, allowNull: true },
      eventType: { type: DataTypes.STRING(64), allowNull: false },
      referenceType: { type: DataTypes.STRING(64), allowNull: true },
      referenceId: { type: DataTypes.INTEGER, allowNull: true },
      performedBy: { type: DataTypes.INTEGER, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.TEXT, allowNull: true },
      eventAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'EquipmentUnitEvent',
      tableName: 'equipmentunitevent',
      freezeTableName: true,
      timestamps: true,
      indexes: [
        { fields: ['equipmentUnitId'] },
        { fields: ['equipmentId'] },
        { fields: ['gymId'] },
        { fields: ['eventType'] },
        { fields: ['eventAt'] },
      ],
    }
  );

  return EquipmentUnitEvent;
};