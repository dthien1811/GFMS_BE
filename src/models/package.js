'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Package extends Model {
    static associate(models) {
      Package.belongsTo(models.Gym, { foreignKey: 'gymId' });
       if (models.Trainer) Package.belongsTo(models.Trainer, { foreignKey: 'trainerId' });
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
    trainerId: DataTypes.INTEGER,
    status: DataTypes.STRING,
    packageType: { 
      type: DataTypes.ENUM('membership', 'personal_training'), 
      defaultValue: 'membership',
      comment: 'membership: gói thành viên theo thời hạn, personal_training: gói PT theo buổi'
    },
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
    tableName: "package"
  });
  return Package;
};