'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Commission extends Model {
    static associate(models) {
      Commission.belongsTo(models.Trainer, { foreignKey: 'trainerId' });
      Commission.belongsTo(models.Booking, { foreignKey: 'bookingId' });
      Commission.belongsTo(models.Gym, { foreignKey: 'gymId' });
      Commission.belongsTo(models.PackageActivation, { foreignKey: 'activationId' });
      if (models.PayrollPeriod) {
        Commission.belongsTo(models.PayrollPeriod, { foreignKey: 'payrollPeriodId' });
      }
    }
  };
  Commission.init({
    trainerId: DataTypes.INTEGER,
    bookingId: DataTypes.INTEGER,
    gymId: DataTypes.INTEGER,
    activationId: DataTypes.INTEGER,
    payrollPeriodId: DataTypes.INTEGER,
    sessionDate: DataTypes.DATE,
    sessionValue: DataTypes.DECIMAL,
    commissionRate: DataTypes.FLOAT,
    commissionAmount: DataTypes.DECIMAL,
    status: { 
      type: DataTypes.ENUM('pending', 'calculated', 'paid'), 
      defaultValue: 'pending' 
    },
    payee: DataTypes.STRING(16),
    retentionReason: DataTypes.TEXT,
    calculatedAt: DataTypes.DATE,
    paidAt: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'Commission',
    tableName: "commission"
  });
  return Commission;
};