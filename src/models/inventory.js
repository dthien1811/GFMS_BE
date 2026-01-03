// models/inventory.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Inventory extends Model {
    static associate(models) {
      Inventory.belongsTo(models.Equipment, { foreignKey: 'equipmentId' });
      Inventory.belongsTo(models.Gym, { foreignKey: 'gymId' });
      Inventory.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
      Inventory.belongsTo(models.PurchaseOrder, { foreignKey: 'purchaseOrderId', optional: true });
    }
  };
  Inventory.init({
    equipmentId: DataTypes.INTEGER,
    gymId: DataTypes.INTEGER,
    action: {
      type: DataTypes.ENUM('import', 'export', 'adjustment', 'transfer'),
      allowNull: false
    },
    quantity: { 
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    stockBefore: DataTypes.INTEGER,
    stockAfter: DataTypes.INTEGER,
    referenceType: {
      type: DataTypes.ENUM('purchase_order', 'maintenance', 'damage', 'adjustment', 'transfer', 'initial'),
      defaultValue: 'adjustment'
    },
    referenceId: DataTypes.INTEGER,
    purchaseOrderId: DataTypes.INTEGER,
    reason: {
      type: DataTypes.ENUM(
        'initial_stock',
        'purchase',
        'return',
        'damaged',
        'lost',
        'adjustment',
        'transfer_in',
        'transfer_out',
        'maintenance',
        'other'
      ),
      defaultValue: 'other'
    },
    costPerUnit: DataTypes.DECIMAL(15, 2),
    totalCost: DataTypes.DECIMAL(15, 2),
    notes: DataTypes.TEXT,
    createdBy: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Inventory',
    indexes: [
      {
        fields: ['equipmentId', 'gymId']
      },
      {
        fields: ['action']
      },
      {
        fields: ['referenceType', 'referenceId']
      }
    ]
  });
  return Inventory;
};