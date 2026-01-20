// models/purchaseorderitem.js
"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class PurchaseOrderItem extends Model {
    static associate(models) {
      PurchaseOrderItem.belongsTo(models.PurchaseOrder, { foreignKey: "purchaseOrderId", as: "purchaseOrder" });
      PurchaseOrderItem.belongsTo(models.Equipment, { foreignKey: "equipmentId", as: "equipment" });
    }
  }

  PurchaseOrderItem.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      purchaseOrderId: { type: DataTypes.INTEGER, allowNull: true },
      equipmentId: { type: DataTypes.INTEGER, allowNull: true },

      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      unitPrice: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
      totalPrice: { type: DataTypes.DECIMAL(15, 2), allowNull: false },

      receivedQuantity: { type: DataTypes.INTEGER, defaultValue: 0 },
      notes: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: "PurchaseOrderItem",
      tableName: "purchaseorderitem",
      freezeTableName: true,
      timestamps: true,
    }
  );

  return PurchaseOrderItem;
};
