'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class PayrollPeriod extends Model {
    static associate(models) {
      PayrollPeriod.belongsTo(models.Gym, { foreignKey: 'gymId' });
      PayrollPeriod.hasMany(models.PayrollItem, { foreignKey: 'periodId', as: 'items' });
      PayrollPeriod.hasMany(models.Commission, { foreignKey: 'payrollPeriodId' });
    }
  }
  PayrollPeriod.init(
    {
      gymId: DataTypes.INTEGER,
      startDate: DataTypes.DATEONLY,
      endDate: DataTypes.DATEONLY,
      status: {
        type: DataTypes.ENUM('closed', 'paid'),
        defaultValue: 'closed',
      },
      totalSessions: DataTypes.INTEGER,
      totalAmount: DataTypes.DECIMAL,
      createdBy: DataTypes.INTEGER,
      paidAt: DataTypes.DATE,
      /** Đã cộng vào trainer.pendingCommission (khi chốt kỳ mới; kỳ cũ null = cộng lúc Chi trả) */
      walletCreditedAt: DataTypes.DATE,
      notes: DataTypes.TEXT,
    },
    {
      sequelize,
      modelName: 'PayrollPeriod',
      tableName: 'payrollperiod',
      freezeTableName: true,
      timestamps: true,
    }
  );
  return PayrollPeriod;
};
