'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class PayrollItem extends Model {
    static associate(models) {
      PayrollItem.belongsTo(models.PayrollPeriod, { foreignKey: 'periodId' });
      PayrollItem.belongsTo(models.Trainer, { foreignKey: 'trainerId' });
    }
  }
  PayrollItem.init(
    {
      periodId: DataTypes.INTEGER,
      trainerId: DataTypes.INTEGER,
      totalSessions: DataTypes.INTEGER,
      totalAmount: DataTypes.DECIMAL,
    },
    {
      sequelize,
      modelName: 'PayrollItem',
      tableName: 'payrollitem',
      freezeTableName: true,
      timestamps: true,
    }
  );
  return PayrollItem;
};
