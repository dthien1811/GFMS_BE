'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Policy extends Model {
    static associate(models) {
      // Optional: belongTo Gym for gym-specific policies
      // => FIX lỗi: "Gym is not associated to Policy!"
      if (models.Gym) {
        Policy.belongsTo(models.Gym, {
          foreignKey: 'gymId',
          as: 'gym',
        });
      }
    }
  }

  Policy.init(
    {
      policyType: {
        type: DataTypes.ENUM('trainer_share', 'commission', 'cancellation', 'refund', 'membership'),
        allowNull: false,
      },
      name: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },

      // Flexible JSON structure (must be object from service validation)
      value: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },

      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

      appliesTo: {
        type: DataTypes.ENUM('system', 'gym', 'trainer'),
        allowNull: false,
      },

      // null for system-wide
      gymId: { type: DataTypes.INTEGER, allowNull: true },

      effectiveFrom: { type: DataTypes.DATE, allowNull: true },
      effectiveTo: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Policy',
      tableName: 'policy',
      freezeTableName: true,
      timestamps: true,
      indexes: [
        { fields: ['policyType'] },
        { fields: ['gymId'] },
        { fields: ['isActive'] },
        { fields: ['appliesTo'] },
      ],
    }
  );

  return Policy;
};
