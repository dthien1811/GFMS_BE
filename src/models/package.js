'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Package extends Model {
    static associate(models) {
      Package.belongsTo(models.Gym, { foreignKey: 'gymId' });
      Package.hasMany(models.Booking, { foreignKey: 'packageId' });
      Package.hasMany(models.Transaction, { foreignKey: 'packageId' });
      Package.hasMany(models.PackageActivation, { foreignKey: 'packageId' });
    }
  };
  Package.init({
    name: DataTypes.STRING,
    description: DataTypes.TEXT,
    type: DataTypes.STRING,
    durationDays: DataTypes.INTEGER,
    price: DataTypes.DECIMAL,
    sessions: DataTypes.INTEGER,
    gymId: DataTypes.INTEGER,
    status: DataTypes.STRING,
    // ========== THÊM MỚI ==========
    pricePerSession: DataTypes.DECIMAL, // = price / sessions
    commissionRate: { 
      type: DataTypes.FLOAT, 
      defaultValue: 0.6 
    }, // % hoa hồng cho PT (ví dụ: 0.6 = 60%)
    isActive: { 
      type: DataTypes.BOOLEAN, 
      defaultValue: true 
    },
    validityType: { 
      type: DataTypes.ENUM('days', 'months', 'sessions'), 
      defaultValue: 'months' 
    },
    maxSessionsPerWeek: DataTypes.INTEGER,
    // ==============================
  }, {
    sequelize,
    modelName: 'Package',
  });
  return Package;
};