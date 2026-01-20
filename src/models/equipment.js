'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Equipment extends Model {
    static associate(models) {
      // Category
      Equipment.belongsTo(models.EquipmentCategory, {
        foreignKey: 'categoryId',
        as: 'category',
      });

      // Maintenance (maintenance có equipmentId + gymId)
      if (models.Maintenance) {
        Equipment.hasMany(models.Maintenance, {
          foreignKey: 'equipmentId',
          as: 'maintenances',
        });
      }

      // Stock theo gym nằm ở EquipmentStock (gymId nằm ở đây, không nằm ở Equipment)
      if (models.EquipmentStock) {
        Equipment.hasMany(models.EquipmentStock, {
          foreignKey: 'equipmentId',
          as: 'stocks',
        });
      }

      // ReceiptItem / Inventory
      if (models.ReceiptItem) {
        Equipment.hasMany(models.ReceiptItem, {
          foreignKey: 'equipmentId',
          as: 'receiptItems',
        });
      }

      if (models.Inventory) {
        Equipment.hasMany(models.Inventory, {
          foreignKey: 'equipmentId',
          as: 'inventoryLogs',
        });
      }

      // Images (nếu có)
      if (models.EquipmentImage) {
        Equipment.hasMany(models.EquipmentImage, {
          foreignKey: 'equipmentId',
          as: 'images',
        });
      }
    }
  }

  Equipment.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      name: { type: DataTypes.STRING, allowNull: false },
      code: { type: DataTypes.STRING, allowNull: true, unique: true },
      description: { type: DataTypes.TEXT, allowNull: true },

      categoryId: { type: DataTypes.INTEGER, allowNull: true },

      brand: { type: DataTypes.STRING, allowNull: true },
      model: { type: DataTypes.STRING, allowNull: true },

      specifications: { type: DataTypes.JSON, allowNull: true },

      unit: { type: DataTypes.STRING, allowNull: false, defaultValue: 'piece' },

      minStockLevel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      maxStockLevel: { type: DataTypes.INTEGER, allowNull: true },

      status: {
        type: DataTypes.ENUM('active', 'discontinued'),
        allowNull: false,
        defaultValue: 'active',
      },
    },
    {
      sequelize,
      modelName: 'Equipment',
      tableName: 'equipment',
      freezeTableName: true,
      timestamps: true,
    }
  );

  return Equipment;
};
