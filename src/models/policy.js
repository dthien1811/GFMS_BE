// src/models/policy.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Policy extends Model {
    static associate(models) {
      // ✅ Gym-specific policies (appliesTo = 'gym') có gymId
      Policy.belongsTo(models.Gym, { foreignKey: 'gymId', as: 'gym' });
    }
  }

  Policy.init(
    {
      policyType: {
        type: DataTypes.ENUM('trainer_share', 'commission', 'cancellation', 'refund', 'membership'),
      },
      name: DataTypes.STRING,
      description: DataTypes.TEXT,
      value: DataTypes.JSON, // Flexible structure
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
      appliesTo: { type: DataTypes.ENUM('system', 'gym', 'trainer') },
      gymId: DataTypes.INTEGER, // null for system-wide
      effectiveFrom: DataTypes.DATE,
      effectiveTo: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Policy',
      tableName: 'policy',
      freezeTableName: true,
      timestamps: true,
      indexes: [{ fields: ['policyType'] }, { fields: ['gymId'] }, { fields: ['isActive'] }],
    }
  );

  return Policy;
};
