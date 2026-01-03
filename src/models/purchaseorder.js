// models/purchaseorder.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PurchaseOrder extends Model {
    static associate(models) {
      // Khớp với trường supplierId trong seeder
      PurchaseOrder.belongsTo(models.Supplier, { foreignKey: 'supplierId' });
      
      // Đổi createdBy thành requestedBy để khớp với file seeder
      PurchaseOrder.belongsTo(models.User, { foreignKey: 'requestedBy', as: 'requester' });
      
      // Giữ lại approvedBy vì seeder có dùng trường này
      PurchaseOrder.belongsTo(models.User, { foreignKey: 'approvedBy', as: 'approver' });
      
      PurchaseOrder.belongsTo(models.Gym, { foreignKey: 'gymId' });
      
      // Thêm quan hệ với Quotation vì seeder có quotationId
      PurchaseOrder.belongsTo(models.Quotation, { foreignKey: 'quotationId' });
      
      PurchaseOrder.hasMany(models.PurchaseOrderItem, { foreignKey: 'purchaseOrderId' });
      PurchaseOrder.hasMany(models.Receipt, { foreignKey: 'purchaseOrderId' });
    }
  };

  PurchaseOrder.init({
    // Đổi orderNumber thành code để khớp với Seeder
    code: { 
      type: DataTypes.STRING,
      unique: true 
    },
    // Thêm quotationId vì seeder có sử dụng
    quotationId: DataTypes.INTEGER,
    supplierId: DataTypes.INTEGER,
    gymId: DataTypes.INTEGER,
    orderDate: DataTypes.DATE,
    expectedDeliveryDate: DataTypes.DATE,
    actualDeliveryDate: DataTypes.DATE,
    status: {
      type: DataTypes.ENUM('draft', 'pending', 'approved', 'ordered', 'delivered', 'cancelled', 'closed'),
      defaultValue: 'pending' // Chỉnh lại mặc định để khớp với logic seeder
    },
    totalAmount: DataTypes.DECIMAL(15, 2),
    discount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    tax: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    finalAmount: DataTypes.DECIMAL(15, 2),
    depositAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    balanceAmount: DataTypes.DECIMAL(15, 2),
    paymentStatus: {
      type: DataTypes.ENUM('unpaid', 'partial', 'paid'),
      defaultValue: 'unpaid'
    },
    deliveryStatus: {
      type: DataTypes.ENUM('pending', 'processing', 'shipped', 'delivered', 'returned'),
      defaultValue: 'pending'
    },
    notes: DataTypes.TEXT,
    termsConditions: DataTypes.TEXT,
    // Đổi createdBy thành requestedBy theo seeder
    requestedBy: DataTypes.INTEGER,
    approvedBy: DataTypes.INTEGER,
    approvedAt: DataTypes.DATE,
    cancelledBy: DataTypes.INTEGER,
    cancelledAt: DataTypes.DATE,
    cancellationReason: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'PurchaseOrder',
    tableName: 'PurchaseOrder', // Đảm bảo tên bảng khớp chính xác với bulkInsert
  });
  return PurchaseOrder;
};