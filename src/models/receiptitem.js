// models/receiptitem.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ReceiptItem extends Model {
    static associate(models) {
      ReceiptItem.belongsTo(models.Receipt, { foreignKey: 'receiptId' });
      ReceiptItem.belongsTo(models.PurchaseOrderItem, { foreignKey: 'purchaseOrderItemId' });
      ReceiptItem.belongsTo(models.Equipment, { foreignKey: 'equipmentId' });
    }
  };
  ReceiptItem.init({
    receiptId: DataTypes.INTEGER,
    purchaseOrderItemId: DataTypes.INTEGER,
    equipmentId: DataTypes.INTEGER,
    orderedQuantity: DataTypes.INTEGER,
    receivedQuantity: DataTypes.INTEGER,
    rejectedQuantity: { type: DataTypes.INTEGER, defaultValue: 0 },
    unitPrice: DataTypes.DECIMAL(15, 2),
    totalPrice: DataTypes.DECIMAL(15, 2),
    condition: {
      type: DataTypes.ENUM('good', 'damaged', 'defective', 'missing_parts'),
      defaultValue: 'good'
    },
    notes: DataTypes.TEXT,
    serialNumbers: DataTypes.JSON, // Array of serial numbers
    warrantyStartDate: DataTypes.DATE,
    warrantyEndDate: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'ReceiptItem',
  });
  return ReceiptItem;
};