'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Equipment extends Model {
    static associate(models) {
      // Quan hệ với EquipmentCategory (vì có categoryId trong migration)
      Equipment.belongsTo(models.EquipmentCategory, { 
        foreignKey: 'categoryId',
        as: 'category'
      });
      
      // Các quan hệ khác (không có trong migration nhưng có thể cần)
      Equipment.hasMany(models.Maintenance, { 
        foreignKey: 'equipmentId',
        as: 'maintenances'
      });
      
      // Quan hệ với bảng inventory, purchase order items, etc.
      // (Thêm sau khi có các bảng đó)
    }
  };
  
  Equipment.init({
    // KHỚP VỚI MIGRATION 30-migrate-equipment.js
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    code: {
      type: DataTypes.STRING,
      unique: true
    },
    description: DataTypes.TEXT,
    categoryId: DataTypes.INTEGER,
    brand: DataTypes.STRING,
    model: DataTypes.STRING,
    specifications: DataTypes.JSON,
    unit: {
      type: DataTypes.STRING,
      defaultValue: 'piece'
    },
    minStockLevel: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    maxStockLevel: DataTypes.INTEGER,
    status: {
      type: DataTypes.ENUM('active', 'discontinued'),
      defaultValue: 'active'
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'Equipment',
    tableName: 'Equipment',
    timestamps: true
  });
  
  return Equipment;
};