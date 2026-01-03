// Cần thêm file: policy.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Policy extends Model {
    static associate(models) {
      // Optional: belongTo Gym for gym-specific policies
    }
  };
  Policy.init({
    policyType: { 
      type: DataTypes.ENUM(
        'trainer_share', 
        'commission', 
        'cancellation', 
        'refund',
        'membership'
      ) 
    },
    name: DataTypes.STRING,
    description: DataTypes.TEXT,
    value: DataTypes.JSON, // Flexible structure
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    appliesTo: { type: DataTypes.ENUM('system', 'gym', 'trainer') },
    gymId: DataTypes.INTEGER, // null for system-wide
    effectiveFrom: DataTypes.DATE,
    effectiveTo: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'Policy',
  });
  return Policy;
};