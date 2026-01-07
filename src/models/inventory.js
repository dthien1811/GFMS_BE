'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Inventory extends Model {
    static associate(models) {
      Inventory.belongsTo(models.Equipment, { foreignKey: 'equipmentId' });
      Inventory.belongsTo(models.Gym, { foreignKey: 'gymId' });
      Inventory.belongsTo(models.User, { foreignKey: 'recordedBy', as: 'recorder' });
    }
  }

  Inventory.init(
    {
      equipmentId: { type: DataTypes.INTEGER, allowNull: false },
      gymId: { type: DataTypes.INTEGER, allowNull: false },

      transactionType: {
        type: DataTypes.ENUM('purchase', 'sale', 'adjustment', 'transfer_in', 'transfer_out', 'return'),

        allowNull: false,
      },

      transactionId: DataTypes.INTEGER,
      transactionCode: DataTypes.STRING,

      // ⚠️ quantity có thể âm khi export (service đang ghi âm)
      quantity: { type: DataTypes.INTEGER, allowNull: false },

      unitPrice: DataTypes.DECIMAL(15, 2),
      totalValue: DataTypes.DECIMAL(15, 2),

      stockBefore: DataTypes.INTEGER,
      stockAfter: DataTypes.INTEGER,

      notes: DataTypes.TEXT,

      recordedBy: DataTypes.INTEGER,
      recordedAt: DataTypes.DATE,

      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Inventory',
      tableName: 'inventory',
      timestamps: true,
      indexes: [
        { fields: ['equipmentId', 'gymId'] },
        { fields: ['transactionType'] },
        { fields: ['transactionCode'] },
      ],
    }
  );

  return Inventory;
};
