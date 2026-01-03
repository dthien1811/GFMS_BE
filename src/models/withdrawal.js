'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Withdrawal extends Model {
    static associate(models) {
      Withdrawal.belongsTo(models.Trainer, { foreignKey: 'trainerId' });
      Withdrawal.belongsTo(models.User, { foreignKey: 'processedBy', as: 'processor' });
    }
  };
  Withdrawal.init({
    trainerId: DataTypes.INTEGER,
    amount: DataTypes.DECIMAL,
    withdrawalMethod: DataTypes.STRING,
    accountInfo: DataTypes.TEXT,
    status: DataTypes.STRING,
    processedBy: DataTypes.INTEGER,
    processedDate: DataTypes.DATE,
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'Withdrawal',
  });
  return Withdrawal;
};