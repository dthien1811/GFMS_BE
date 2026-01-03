// models/receipt.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Receipt extends Model {
    static associate(models) {
      Receipt.belongsTo(models.PurchaseOrder, { foreignKey: 'purchaseOrderId' });
      Receipt.belongsTo(models.User, { foreignKey: 'receivedBy', as: 'receiver' });
      Receipt.belongsTo(models.User, { foreignKey: 'checkedBy', as: 'checker' });
      Receipt.belongsTo(models.Gym, { foreignKey: 'gymId' });
      Receipt.hasMany(models.ReceiptItem, { foreignKey: 'receiptId' });
    }
  };
  Receipt.init({
    receiptNumber: { 
      type: DataTypes.STRING,
      unique: true 
    },
    purchaseOrderId: DataTypes.INTEGER,
    gymId: DataTypes.INTEGER,
    receiptDate: DataTypes.DATE,
    receiptType: {
      type: DataTypes.ENUM('full', 'partial', 'return'),
      defaultValue: 'full'
    },
    status: {
      type: DataTypes.ENUM('draft', 'received', 'checked', 'approved', 'cancelled'),
      defaultValue: 'draft'
    },
    totalQuantity: DataTypes.INTEGER,
    notes: DataTypes.TEXT,
    receivedBy: DataTypes.INTEGER,
    checkedBy: DataTypes.INTEGER,
    checkedAt: DataTypes.DATE,
    approvedBy: DataTypes.INTEGER,
    approvedAt: DataTypes.DATE,
    storageLocation: DataTypes.STRING,
    conditionNotes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'Receipt',
  });
  return Receipt;
};