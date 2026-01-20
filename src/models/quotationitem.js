// models/quotationitem.js
"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class QuotationItem extends Model {
    static associate(models) {
      QuotationItem.belongsTo(models.Quotation, { foreignKey: "quotationId", as: "quotation" });
      QuotationItem.belongsTo(models.Equipment, { foreignKey: "equipmentId", as: "equipment" });
    }
  }

  QuotationItem.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      quotationId: { type: DataTypes.INTEGER, allowNull: true },
      equipmentId: { type: DataTypes.INTEGER, allowNull: true },

      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      unitPrice: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
      totalPrice: { type: DataTypes.DECIMAL(15, 2), allowNull: false },

      notes: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: "QuotationItem",
      tableName: "quotationitem",
      freezeTableName: true,
      timestamps: true,
    }
  );

  return QuotationItem;
};
