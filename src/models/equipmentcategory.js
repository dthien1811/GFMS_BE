// models/equipmentcategory.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class EquipmentCategory extends Model {
    static associate(models) {
      EquipmentCategory.hasMany(models.Equipment, { foreignKey: 'categoryId' });
    }
  };
  EquipmentCategory.init({
    name: DataTypes.STRING,
    code: DataTypes.STRING,
    description: DataTypes.TEXT,
    parentId: DataTypes.INTEGER,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    sequelize,
    modelName: 'EquipmentCategory',
  });
  return EquipmentCategory;
};