'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Supplier extends Model {
    static associate(models) {
      // Đợt 1: không gắn Equipment qua supplierId (vì Equipment table của bạn không có supplierId)
      // Supplier.hasMany(models.Equipment, { foreignKey: 'supplierId' });

      // Nếu các bảng PurchaseOrder/Quotation của bạn có supplierId thì bạn mở lại sau.
      // Supplier.hasMany(models.PurchaseOrder, { foreignKey: 'supplierId' });
      // Supplier.hasMany(models.Quotation, { foreignKey: 'supplierId' });
    }
  }

  Supplier.init(
    {
      name: DataTypes.STRING,
      code: DataTypes.STRING,

      // ✅ DB của FE đang dùng
      phone: DataTypes.STRING,
      email: DataTypes.STRING,

      address: DataTypes.STRING,
      taxCode: DataTypes.STRING,
      notes: DataTypes.TEXT,
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Supplier',
      tableName: 'Supplier',
      timestamps: true,
    }
  );

  return Supplier;
};
