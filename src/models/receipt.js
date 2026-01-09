'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Receipt extends Model {
    static associate(models) {
      Receipt.belongsTo(models.Gym, { foreignKey: 'gymId', as: 'gym' });
      Receipt.belongsTo(models.User, { foreignKey: 'processedBy', as: 'processor' });
      Receipt.belongsTo(models.PurchaseOrder, { foreignKey: 'purchaseOrderId', as: 'purchaseOrder' });
      Receipt.belongsTo(models.Supplier, { foreignKey: 'supplierId', as: 'supplier' });

      Receipt.hasMany(models.ReceiptItem, { foreignKey: 'receiptId', as: 'items' });
    }
  }

  Receipt.init(
    {
      code: { type: DataTypes.STRING, allowNull: false, unique: true },
      purchaseOrderId: { type: DataTypes.INTEGER, allowNull: true },
      type: { type: DataTypes.ENUM('inbound', 'outbound'), allowNull: false },
      gymId: { type: DataTypes.INTEGER, allowNull: true },
      supplierId: { type: DataTypes.INTEGER, allowNull: true }, // ✅ new
      processedBy: { type: DataTypes.INTEGER, allowNull: true },
      receiptDate: { type: DataTypes.DATE, allowNull: false },
      status: { type: DataTypes.ENUM('pending', 'completed', 'cancelled'), defaultValue: 'pending' },
      totalValue: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
      notes: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Receipt',
      tableName: 'Receipt',
      freezeTableName: true,
      timestamps: true,
    }
  );

  return Receipt;
};
