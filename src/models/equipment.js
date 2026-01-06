'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Equipment extends Model {
    static associate(models) {
      Equipment.belongsTo(models.EquipmentCategory, {
        foreignKey: 'categoryId',
        as: 'category',
      });

      Equipment.hasMany(models.Maintenance, {
        foreignKey: 'equipmentId',
        as: 'maintenances',
      });
    }
  }

  Equipment.init(
    {
      name: { type: DataTypes.STRING, allowNull: false },
      code: { type: DataTypes.STRING, unique: true },
      description: DataTypes.TEXT,
      categoryId: DataTypes.INTEGER,
      brand: DataTypes.STRING,
      model: DataTypes.STRING,
      specifications: DataTypes.JSON,
      unit: { type: DataTypes.STRING, defaultValue: 'piece' },
      minStockLevel: { type: DataTypes.INTEGER, defaultValue: 0 },
      maxStockLevel: DataTypes.INTEGER,
      status: { type: DataTypes.ENUM('active', 'discontinued'), defaultValue: 'active' },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Equipment',
      tableName: 'Equipment',
      timestamps: true,
    }
  );

  return Equipment;
};
