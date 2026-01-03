// models/quotationitem.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class QuotationItem extends Model {
    static associate(models) {
      QuotationItem.belongsTo(models.Quotation, { foreignKey: 'quotationId' });
      QuotationItem.belongsTo(models.Equipment, { foreignKey: 'equipmentId', optional: true });
    }
  };
  QuotationItem.init({
    quotationId: DataTypes.INTEGER,
    equipmentId: DataTypes.INTEGER,
    itemName: DataTypes.STRING,
    itemDescription: DataTypes.TEXT,
    quantity: DataTypes.INTEGER,
    unit: DataTypes.STRING,
    unitPrice: DataTypes.DECIMAL(15, 2),
    totalPrice: DataTypes.DECIMAL(15, 2),
    specifications: DataTypes.JSON,
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'QuotationItem',
  });
  return QuotationItem;
};