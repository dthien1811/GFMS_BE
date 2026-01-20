// models/receiptitem.js
"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class ReceiptItem extends Model {
    static associate(models) {
      ReceiptItem.belongsTo(models.Receipt, { foreignKey: "receiptId", as: "receipt" });
      ReceiptItem.belongsTo(models.Equipment, { foreignKey: "equipmentId", as: "equipment" });
    }
  }

  ReceiptItem.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      receiptId: { type: DataTypes.INTEGER, allowNull: false },
      equipmentId: { type: DataTypes.INTEGER, allowNull: true },

      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      unitPrice: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
      totalPrice: { type: DataTypes.DECIMAL(15, 2), allowNull: false },

      batchNumber: { type: DataTypes.STRING, allowNull: true },
      expiryDate: { type: DataTypes.DATE, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: "ReceiptItem",
      tableName: "receiptitem",
      freezeTableName: true,
      timestamps: true,
    }
  );

  return ReceiptItem;
};
