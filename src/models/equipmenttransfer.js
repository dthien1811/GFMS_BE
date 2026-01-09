'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EquipmentTransfer extends Model {
    static associate(models) {
      // Gym gửi đi
      EquipmentTransfer.belongsTo(models.Gym, {
        foreignKey: 'fromGymId',
        as: 'fromGym',
      });

      // Gym nhận
      EquipmentTransfer.belongsTo(models.Gym, {
        foreignKey: 'toGymId',
        as: 'toGym',
      });

      // Người tạo yêu cầu
      EquipmentTransfer.belongsTo(models.User, {
        foreignKey: 'requestedBy',
        as: 'requester',
      });

      // Người duyệt
      EquipmentTransfer.belongsTo(models.User, {
        foreignKey: 'approvedBy',
        as: 'approver',
      });

      // 1 phiếu điều chuyển có nhiều dòng thiết bị
      EquipmentTransfer.hasMany(models.EquipmentTransferItem, {
        foreignKey: 'transferId',
        as: 'items',
        onDelete: 'CASCADE',
        hooks: true,
      });
    }
  }

  EquipmentTransfer.init(
    {
      code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      fromGymId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      toGymId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      requestedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      approvedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      transferDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },

      status: {
        type: DataTypes.ENUM('pending', 'approved', 'in_transit', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },

      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'EquipmentTransfer',
      tableName: 'EquipmentTransfer', // ✅ đúng tên bảng theo migration 39
      freezeTableName: true,
    }
  );

  return EquipmentTransfer;
};
