'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EquipmentTransferItem extends Model {
    static associate(models) {
      // item thuộc về 1 transfer
      EquipmentTransferItem.belongsTo(models.EquipmentTransfer, {
        foreignKey: 'transferId',
        as: 'transfer',
        onDelete: 'CASCADE',
      });

      // item thuộc về 1 equipment
      EquipmentTransferItem.belongsTo(models.Equipment, {
        foreignKey: 'equipmentId',
        as: 'equipment',
      });
    }
  }

  EquipmentTransferItem.init(
    {
      transferId: {
        type: DataTypes.INTEGER,
        allowNull: false, // ✅ migration 40
      },

      equipmentId: {
        type: DataTypes.INTEGER,
        allowNull: false, // ✅ migration 40
      },

      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'EquipmentTransferItem',
      tableName: 'EquipmentTransferItem', // ✅ đúng tên bảng theo migration 40
      freezeTableName: true,
    }
  );

  return EquipmentTransferItem;
};
