'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Commission extends Model {
    static associate(models) {
      Commission.belongsTo(models.Trainer, { foreignKey: 'trainerId' });
      Commission.belongsTo(models.Booking, { foreignKey: 'bookingId' });
      Commission.belongsTo(models.Gym, { foreignKey: 'gymId' });
      Commission.belongsTo(models.PackageActivation, { foreignKey: 'activationId' });
    }
  };
  Commission.init({
    trainerId: DataTypes.INTEGER,
    bookingId: DataTypes.INTEGER,
    gymId: DataTypes.INTEGER,
    activationId: DataTypes.INTEGER,
    sessionDate: DataTypes.DATE,
    sessionValue: DataTypes.DECIMAL,
    commissionRate: DataTypes.FLOAT,
    commissionAmount: DataTypes.DECIMAL,
    status: { 
      type: DataTypes.ENUM('pending', 'calculated', 'paid'), 
      defaultValue: 'pending' 
    },
    calculatedAt: DataTypes.DATE,
    paidAt: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'Commission',
  });
  return Commission;
};