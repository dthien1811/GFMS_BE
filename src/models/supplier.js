'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Supplier extends Model {
    static associate(models) {
      if (models.EquipmentCombo) {
        Supplier.hasMany(models.EquipmentCombo, { foreignKey: 'supplierId', as: 'equipmentCombos' });
      }
    }
  }

  Supplier.init(
    {
      name: DataTypes.STRING,
      code: DataTypes.STRING,
      contactPerson: DataTypes.STRING,
      email: DataTypes.STRING,
      phone: DataTypes.STRING,
      address: DataTypes.TEXT,
      taxCode: DataTypes.STRING,
      status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
      notes: DataTypes.TEXT,
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Supplier',
      tableName: 'supplier',
      timestamps: true,
    }
  );

  return Supplier;
};
