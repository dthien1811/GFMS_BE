'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EquipmentCombo extends Model {
    static associate(models) {
      EquipmentCombo.belongsTo(models.Supplier, {
        foreignKey: 'supplierId',
        as: 'supplier',
      });
      EquipmentCombo.hasMany(models.EquipmentComboItem, {
        foreignKey: 'comboId',
        as: 'items',
      });
      EquipmentCombo.hasMany(models.PurchaseRequest, {
        foreignKey: 'comboId',
        as: 'purchaseRequests',
      });
    }
  }

  EquipmentCombo.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING, allowNull: false },
      code: { type: DataTypes.STRING, allowNull: false, unique: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      price: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
      },
      thumbnail: { type: DataTypes.TEXT, allowNull: true },
      supplierId: { type: DataTypes.INTEGER, allowNull: true },
      isSelling: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      sequelize,
      modelName: 'EquipmentCombo',
      tableName: 'equipment_combo',
      freezeTableName: true,
      timestamps: true,
    }
  );

  return EquipmentCombo;
};
