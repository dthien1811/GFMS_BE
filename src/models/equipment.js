'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Equipment extends Model {
    static associate(models) {
      Equipment.belongsTo(models.EquipmentCategory, { foreignKey: 'categoryId', as: 'category' });

      if (models.Maintenance) {
        Equipment.hasMany(models.Maintenance, { foreignKey: 'equipmentId', as: 'maintenances' });
      }

      // ✅ thêm các quan hệ kho đúng schema
      if (models.EquipmentStock) Equipment.hasMany(models.EquipmentStock, { foreignKey: 'equipmentId' });
      if (models.ReceiptItem) Equipment.hasMany(models.ReceiptItem, { foreignKey: 'equipmentId' });
      if (models.Inventory) Equipment.hasMany(models.Inventory, { foreignKey: 'equipmentId' });
      if (models.EquipmentImage) {
  Equipment.hasMany(models.EquipmentImage, { foreignKey: "equipmentId", as: "images" });
}

    }
  }

  Equipment.init(
    {
      name: { type: DataTypes.STRING, allowNull: false },
      code: DataTypes.STRING,
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
      tableName: 'equipment',
      timestamps: true,
    }
  );

  return Equipment;
};
