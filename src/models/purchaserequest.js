"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class PurchaseRequest extends Model {
    static associate(models) {
      PurchaseRequest.belongsTo(models.Gym, { foreignKey: "gymId", as: "gym" });
      PurchaseRequest.belongsTo(models.Equipment, { foreignKey: "equipmentId", as: "equipment" });
      PurchaseRequest.belongsTo(models.EquipmentCombo, { foreignKey: "comboId", as: "combo" });
      PurchaseRequest.belongsTo(models.Supplier, { foreignKey: "expectedSupplierId", as: "expectedSupplier" });
      PurchaseRequest.belongsTo(models.User, { foreignKey: "requestedBy", as: "requester" });
      PurchaseRequest.belongsTo(models.Quotation, { foreignKey: "quotationId", as: "quotation" });
      PurchaseRequest.hasMany(models.Transaction, { foreignKey: "purchaseRequestId", as: "payments" });
    }
  }

  PurchaseRequest.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      code: { type: DataTypes.STRING, allowNull: false, unique: true },
      gymId: { type: DataTypes.INTEGER, allowNull: false },
      equipmentId: { type: DataTypes.INTEGER, allowNull: true },
      comboId: { type: DataTypes.INTEGER, allowNull: true },
      expectedSupplierId: { type: DataTypes.INTEGER, allowNull: true },
      requestedBy: { type: DataTypes.INTEGER, allowNull: false },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      expectedUnitPrice: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      availableQty: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
      issueQty: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
      purchaseQty: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
      payableAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true, defaultValue: 0 },
      totalAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true, defaultValue: 0 },
      depositAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true, defaultValue: 0 },
      finalAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true, defaultValue: 0 },
      remainingAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true, defaultValue: 0 },
      reason: { type: DataTypes.STRING(64), allowNull: true, defaultValue: "combo_purchase" },
      priority: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "normal" },
      note: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "submitted" },
      adminRejectionNote: { type: DataTypes.TEXT, allowNull: true },
      rejectReason: { type: DataTypes.TEXT, allowNull: true },
      contactName: { type: DataTypes.STRING, allowNull: true },
      contactPhone: { type: DataTypes.STRING, allowNull: true },
      contactEmail: { type: DataTypes.STRING, allowNull: true },
      quotationId: { type: DataTypes.INTEGER, allowNull: true },
      approvedAt: { type: DataTypes.DATE, allowNull: true },
      rejectedAt: { type: DataTypes.DATE, allowNull: true },
      shippingAt: { type: DataTypes.DATE, allowNull: true },
      confirmedReceivedAt: { type: DataTypes.DATE, allowNull: true },
      completedAt: { type: DataTypes.DATE, allowNull: true },
      stockSnapshot: { type: DataTypes.JSON, allowNull: true },
    },
    {
      sequelize,
      modelName: "PurchaseRequest",
      tableName: "purchaserequest",
      freezeTableName: true,
      timestamps: true,
    }
  );

  return PurchaseRequest;
};
