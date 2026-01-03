// models/quotation.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Quotation extends Model {
    static associate(models) {
      Quotation.belongsTo(models.Supplier, { foreignKey: 'supplierId' });
      Quotation.belongsTo(models.User, { foreignKey: 'requestedBy', as: 'requester' });
      Quotation.belongsTo(models.User, { foreignKey: 'reviewedBy', as: 'reviewer' });
      Quotation.belongsTo(models.Gym, { foreignKey: 'gymId' });
      Quotation.hasMany(models.QuotationItem, { foreignKey: 'quotationId' });
    }
  };
  Quotation.init({
    quotationNumber: { 
      type: DataTypes.STRING,
      unique: true 
    },
    supplierId: DataTypes.INTEGER,
    gymId: DataTypes.INTEGER,
    requestDate: DataTypes.DATE,
    validityDate: DataTypes.DATE,
    status: {
      type: DataTypes.ENUM('requested', 'quoted', 'approved', 'rejected', 'expired'),
      defaultValue: 'requested'
    },
    totalAmount: DataTypes.DECIMAL(15, 2),
    discount: DataTypes.DECIMAL(15, 2),
    tax: DataTypes.DECIMAL(15, 2),
    finalAmount: DataTypes.DECIMAL(15, 2),
    deliveryTime: DataTypes.STRING,
    paymentTerms: DataTypes.TEXT,
    warranty: DataTypes.TEXT,
    notes: DataTypes.TEXT,
    requestedBy: DataTypes.INTEGER,
    reviewedBy: DataTypes.INTEGER,
    reviewedAt: DataTypes.DATE,
    rejectionReason: DataTypes.TEXT,
    convertedToPurchaseOrder: { type: DataTypes.BOOLEAN, defaultValue: false },
    purchaseOrderId: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Quotation',
  });
  return Quotation;
};