// models/quotation.js
"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Quotation extends Model {
    static associate(models) {
      Quotation.belongsTo(models.Supplier, { foreignKey: "supplierId", as: "supplier" });
      Quotation.belongsTo(models.Gym, { foreignKey: "gymId", as: "gym" });
      Quotation.belongsTo(models.User, { foreignKey: "requestedBy", as: "requester" });

      Quotation.hasMany(models.QuotationItem, { foreignKey: "quotationId", as: "items" });
    }
  }

  Quotation.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      // ✅ migration dùng code (NOT quotationNumber)
      code: { type: DataTypes.STRING, allowNull: false, unique: true },

      supplierId: { type: DataTypes.INTEGER, allowNull: true },
      gymId: { type: DataTypes.INTEGER, allowNull: true },
      requestedBy: { type: DataTypes.INTEGER, allowNull: true },

      // ✅ migration dùng validUntil
      validUntil: { type: DataTypes.DATE, allowNull: true },

      // ✅ migration status: pending/approved/rejected/expired
      status: {
        type: DataTypes.ENUM("pending", "approved", "rejected", "expired"),
        defaultValue: "pending",
      },

      totalAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
      notes: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: "Quotation",
      tableName: "quotation",
      freezeTableName: true,
      timestamps: true,
    }
  );

  return Quotation;
};
