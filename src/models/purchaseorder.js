// models/purchaseorder.js
"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class PurchaseOrder extends Model {
    static associate(models) {
      PurchaseOrder.belongsTo(models.Supplier, { foreignKey: "supplierId", as: "supplier" });
      PurchaseOrder.belongsTo(models.Gym, { foreignKey: "gymId", as: "gym" });
      PurchaseOrder.belongsTo(models.User, { foreignKey: "requestedBy", as: "requester" });
      PurchaseOrder.belongsTo(models.User, { foreignKey: "approvedBy", as: "approver" });

      PurchaseOrder.belongsTo(models.Quotation, { foreignKey: "quotationId", as: "quotation" });

      PurchaseOrder.hasMany(models.PurchaseOrderItem, { foreignKey: "purchaseOrderId", as: "items" });
      PurchaseOrder.hasMany(models.Receipt, { foreignKey: "purchaseOrderId", as: "receipts" });
    }
  }

  PurchaseOrder.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      code: { type: DataTypes.STRING, allowNull: false, unique: true },
      quotationId: { type: DataTypes.INTEGER, allowNull: true },

      supplierId: { type: DataTypes.INTEGER, allowNull: true },
      gymId: { type: DataTypes.INTEGER, allowNull: true },

      requestedBy: { type: DataTypes.INTEGER, allowNull: true },
      approvedBy: { type: DataTypes.INTEGER, allowNull: true },

      // ✅ migration: orderDate required
      orderDate: { type: DataTypes.DATE, allowNull: false },
      expectedDeliveryDate: { type: DataTypes.DATE, allowNull: true },

      // ✅ migration status only these values
      status: {
        type: DataTypes.ENUM("pending", "approved", "ordered", "delivered", "cancelled"),
        defaultValue: "pending",
      },

      totalAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
      notes: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: "PurchaseOrder",
      tableName: "purchaseorder",
      freezeTableName: true,
      timestamps: true,
    }
  );

  return PurchaseOrder;
};
