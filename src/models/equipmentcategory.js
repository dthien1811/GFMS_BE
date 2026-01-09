'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EquipmentCategory extends Model {
    static associate(models) {
      EquipmentCategory.hasMany(models.Equipment, { foreignKey: 'categoryId' });
      EquipmentCategory.belongsTo(models.EquipmentCategory, { foreignKey: 'parentId', as: 'parent' });
      EquipmentCategory.hasMany(models.EquipmentCategory, { foreignKey: 'parentId', as: 'children' });
    }
  }

  EquipmentCategory.init(
    {
      name: DataTypes.STRING,
      code: DataTypes.STRING,
      description: DataTypes.TEXT,
      parentId: DataTypes.INTEGER,
      // nếu DB thật sự KHÔNG có isActive thì bỏ dòng này
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'EquipmentCategory',
      tableName: 'equipmentcategory',
      timestamps: true,
    }
  );

  return EquipmentCategory;
};
