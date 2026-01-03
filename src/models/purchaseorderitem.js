// models/purchaseorderitem.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class PurchaseOrderItem extends Model {
    static associate(models) {
      PurchaseOrderItem.belongsTo(models.PurchaseOrder, { foreignKey: 'purchaseOrderId' });
      PurchaseOrderItem.belongsTo(models.Equipment, { foreignKey: 'equipmentId' });
    }
  };
  PurchaseOrderItem.init({
    purchaseOrderId: DataTypes.INTEGER,
    equipmentId: DataTypes.INTEGER,
    quantity: DataTypes.INTEGER,
    unitPrice: DataTypes.DECIMAL(15, 2),
    totalPrice: DataTypes.DECIMAL(15, 2),
    receivedQuantity: { type: DataTypes.INTEGER, defaultValue: 0 },
    remainingQuantity: DataTypes.INTEGER,
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'PurchaseOrderItem',
  });
  return PurchaseOrderItem;
};