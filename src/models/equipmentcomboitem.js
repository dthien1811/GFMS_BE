'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EquipmentComboItem extends Model {
    static associate(models) {
      EquipmentComboItem.belongsTo(models.EquipmentCombo, {
        foreignKey: 'comboId',
        as: 'combo',
      });
      EquipmentComboItem.belongsTo(models.Equipment, {
        foreignKey: 'equipmentId',
        as: 'equipment',
      });
    }
  }

  EquipmentComboItem.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      comboId: { type: DataTypes.INTEGER, allowNull: false },
      equipmentId: { type: DataTypes.INTEGER, allowNull: false },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      note: { type: DataTypes.TEXT, allowNull: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      sequelize,
      modelName: 'EquipmentComboItem',
      tableName: 'equipment_combo_item',
      freezeTableName: true,
      timestamps: true,
    }
  );

  return EquipmentComboItem;
};
