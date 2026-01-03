// models/supplier.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Supplier extends Model {
    static associate(models) {
      Supplier.hasMany(models.Equipment, { foreignKey: 'supplierId' });
      Supplier.hasMany(models.PurchaseOrder, { foreignKey: 'supplierId' });
      Supplier.hasMany(models.Quotation, { foreignKey: 'supplierId' });
    }
  };
  Supplier.init({
    name: DataTypes.STRING,
    code: DataTypes.STRING,
    contactPerson: DataTypes.STRING,
    contactPhone: DataTypes.STRING,
    contactEmail: DataTypes.STRING,
    address: DataTypes.STRING,
    taxCode: DataTypes.STRING,
    products: DataTypes.TEXT,
    rating: { type: DataTypes.FLOAT, defaultValue: 5 },
    paymentTerms: DataTypes.STRING,
    deliveryTerms: DataTypes.STRING,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'Supplier',
  });
  return Supplier;
};