'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Receipt extends Model {
    static associate(models) {
      Receipt.belongsTo(models.Gym, { foreignKey: 'gymId' });
      Receipt.belongsTo(models.User, { foreignKey: 'processedBy', as: 'processor' });

      if (models.PurchaseOrder) {
        Receipt.belongsTo(models.PurchaseOrder, { foreignKey: 'purchaseOrderId' });
      }

      Receipt.hasMany(models.ReceiptItem, { foreignKey: 'receiptId' });
    }
  }

  Receipt.init(
    {
      code: { type: DataTypes.STRING, allowNull: false, unique: true },
      purchaseOrderId: DataTypes.INTEGER,

      type: { type: DataTypes.ENUM('inbound', 'outbound'), defaultValue: 'inbound' },
      gymId: { type: DataTypes.INTEGER, allowNull: false },

      processedBy: DataTypes.INTEGER,
      receiptDate: DataTypes.DATE,

      status: { type: DataTypes.ENUM('pending', 'completed', 'cancelled'), defaultValue: 'completed' },

      totalValue: DataTypes.DECIMAL(15, 2),
      notes: DataTypes.TEXT,

      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Receipt',
      tableName: 'receipt',
      timestamps: true,
    }
  );

  return Receipt;
};
