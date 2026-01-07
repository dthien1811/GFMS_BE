'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ReceiptItem extends Model {
    static associate(models) {
      ReceiptItem.belongsTo(models.Receipt, { foreignKey: 'receiptId' });
      ReceiptItem.belongsTo(models.Equipment, { foreignKey: 'equipmentId' });
    }
  }

  ReceiptItem.init(
    {
      receiptId: { type: DataTypes.INTEGER, allowNull: false },
      equipmentId: { type: DataTypes.INTEGER, allowNull: false },

      quantity: { type: DataTypes.INTEGER, allowNull: false },
      unitPrice: DataTypes.DECIMAL(15, 2),
      totalPrice: DataTypes.DECIMAL(15, 2),

      batchNumber: DataTypes.STRING,
      expiryDate: DataTypes.DATE,
      notes: DataTypes.TEXT,

      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'ReceiptItem',
      tableName: 'receiptitem',
      timestamps: true,
    }
  );

  return ReceiptItem;
};
