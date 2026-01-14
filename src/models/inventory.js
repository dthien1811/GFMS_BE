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

      transactionId: { type: DataTypes.INTEGER, allowNull: true },
      transactionCode: { type: DataTypes.STRING, allowNull: true },

      quantity: { type: DataTypes.INTEGER, allowNull: false },

      unitPrice: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      totalValue: { type: DataTypes.DECIMAL(15, 2), allowNull: true },

      stockBefore: { type: DataTypes.INTEGER, allowNull: true },
      stockAfter: { type: DataTypes.INTEGER, allowNull: true },

      notes: { type: DataTypes.TEXT, allowNull: true },

      recordedBy: { type: DataTypes.INTEGER, allowNull: true },
      recordedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Inventory',
      tableName: 'inventory',
      freezeTableName: true,
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
