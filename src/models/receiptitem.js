'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ReceiptItem extends Model {
    static associate(models) {
      ReceiptItem.belongsTo(models.Receipt, { foreignKey: 'receiptId', as: 'receipt' });
      ReceiptItem.belongsTo(models.Equipment, { foreignKey: 'equipmentId', as: 'equipment' });
    }
  }

  ReceiptItem.init(
    {
      receiptId: { type: DataTypes.INTEGER, allowNull: false },
      equipmentId: { type: DataTypes.INTEGER, allowNull: false },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      unitPrice: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      totalPrice: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      batchNumber: { type: DataTypes.STRING, allowNull: true },
      expiryDate: { type: DataTypes.DATE, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'ReceiptItem',
      tableName: 'ReceiptItem',
      freezeTableName: true,
      timestamps: true,
    }
  );

  return ReceiptItem;
};
