// src/models/membermetric.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MemberMetric extends Model {
    static associate(models) {
      MemberMetric.belongsTo(models.Member, {
        foreignKey: 'memberId',
        as: 'member',
      });
    }
  }

  MemberMetric.init(
    {
      memberId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      heightCm: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      weightKg: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      bmi: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('underweight', 'normal', 'overweight', 'obese'),
        allowNull: false,
      },
      note: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      recordedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'MemberMetric',
      tableName: 'member_metric',
      freezeTableName: true,
      timestamps: true,
      indexes: [{ fields: ['memberId'] }, { fields: ['recordedAt'] }],
    }
  );

  return MemberMetric;
};