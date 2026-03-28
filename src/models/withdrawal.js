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
    notes: DataTypes.TEXT,
    /** PT gửi yêu cầu: đã trừ pendingCommission; false = yêu cầu cũ (trừ khi owner duyệt) */
    balanceHeld: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, {
    sequelize,
    modelName: 'Withdrawal',
    tableName: "withdrawal"
  });
  return Withdrawal;
};