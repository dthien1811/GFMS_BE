'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FranchiseRequest extends Model {
    static associate(models) {
      FranchiseRequest.belongsTo(models.User, {
        foreignKey: 'requesterId',
        as: 'requester',
      });

      FranchiseRequest.belongsTo(models.User, {
        foreignKey: 'reviewedBy',
        as: 'reviewer',
      });
    }
  }

  FranchiseRequest.init(
    {
      requesterId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      businessName: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      location: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      contactPerson: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      contactPhone: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          is: /^[0-9]{10,11}$/,
        },
      },

      contactEmail: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isEmail: true,
        },
      },

      investmentAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },

      businessPlan: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },

      reviewedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      reviewNotes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      approvedDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      contractSigned: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: 'FranchiseRequest',
      tableName: 'franchiserequest',
      freezeTableName: true,
      timestamps: true,
    }
  );

  return FranchiseRequest;
};
