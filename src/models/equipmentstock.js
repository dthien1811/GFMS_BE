// models/equipmentstock.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class EquipmentStock extends Model {
    static associate(models) {
      EquipmentStock.belongsTo(models.Equipment, { foreignKey: 'equipmentId' });
      EquipmentStock.belongsTo(models.Gym, { foreignKey: 'gymId' });
    }
  };
  EquipmentStock.init({
    equipmentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Equipment',
        key: 'id'
      }
    },
    gymId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Gym',
        key: 'id'
      }
    },
    quantity: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    availableQuantity: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    reservedQuantity: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    damagedQuantity: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    maintenanceQuantity: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    minStockLevel: {
      type: DataTypes.INTEGER,
      defaultValue: 5
    },
    maxStockLevel: {
      type: DataTypes.INTEGER,
      defaultValue: 100
    },
    reorderPoint: {
      type: DataTypes.INTEGER,
      defaultValue: 10
    },
    lastRestocked: DataTypes.DATE,
    lastAudited: DataTypes.DATE,
    averageMonthlyUsage: DataTypes.INTEGER,
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'EquipmentStock',
    indexes: [
      {
        unique: true,
        fields: ['equipmentId', 'gymId']
      }
    ]
  });
  return EquipmentStock;
};