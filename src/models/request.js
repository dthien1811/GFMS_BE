'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Request extends Model {
    static associate(models) {
      // người tạo yêu cầu (PT / user)
      if (models.User) {
        Request.belongsTo(models.User, {
          foreignKey: 'requesterId',
          as: 'requester',
        });

        // người duyệt yêu cầu (manager/admin)
        Request.belongsTo(models.User, {
          foreignKey: 'approverId',
          as: 'approver',
        });
      }
    }
  }

  Request.init(
    {
      requestType: {
        type: DataTypes.ENUM('LEAVE', 'SHIFT_CHANGE', 'TRANSFER_BRANCH', 'OVERTIME'),
        allowNull: false,
      },

      status: {
        type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },

      requesterId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      approverId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      approveNote: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      data: {
        type: DataTypes.JSON,
        allowNull: true,
      },

      processedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Request',
      tableName: 'request', // ✅ đúng style tableName số ít như user/trainer/role/group
      timestamps: true,
      // freezeTableName: true, // (optional) vì index.js đã set global rồi
    }
  );

  return Request;
};
