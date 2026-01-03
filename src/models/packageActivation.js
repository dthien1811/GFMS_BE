'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class PackageActivation extends Model {
    static associate(models) {
      PackageActivation.belongsTo(models.Member, { foreignKey: 'memberId' });
      PackageActivation.belongsTo(models.Package, { foreignKey: 'packageId' });
      PackageActivation.belongsTo(models.Transaction, { foreignKey: 'transactionId' });
      PackageActivation.hasMany(models.Booking, { foreignKey: 'packageActivationId' });
    }
  };
  PackageActivation.init({
    memberId: DataTypes.INTEGER,
    packageId: DataTypes.INTEGER,
    transactionId: DataTypes.INTEGER,
    activationDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    expiryDate: DataTypes.DATE,
    totalSessions: DataTypes.INTEGER,
    sessionsUsed: { type: DataTypes.INTEGER, defaultValue: 0 },
    sessionsRemaining: DataTypes.INTEGER,
    pricePerSession: DataTypes.DECIMAL,
    status: { 
      type: DataTypes.ENUM('active', 'expired', 'cancelled', 'completed'), 
      defaultValue: 'active' 
    },
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'PackageActivation',
  });
  return PackageActivation;
};