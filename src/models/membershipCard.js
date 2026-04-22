'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MembershipCard extends Model {
    static associate(models) {
      MembershipCard.belongsTo(models.Member, { foreignKey: 'memberId' });
      MembershipCard.belongsTo(models.Gym, { foreignKey: 'gymId' });
      MembershipCard.belongsTo(models.Transaction, { foreignKey: 'transactionId' });
    }
  }

  MembershipCard.init(
    {
      memberId: { type: DataTypes.INTEGER, allowNull: false },
      gymId: { type: DataTypes.INTEGER, allowNull: false },
      transactionId: { type: DataTypes.INTEGER, allowNull: true },
      planCode: { type: DataTypes.STRING(32), allowNull: false },
      planMonths: { type: DataTypes.INTEGER, allowNull: false },
      price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      startDate: { type: DataTypes.DATE, allowNull: false },
      endDate: { type: DataTypes.DATE, allowNull: false },
      status: {
        type: DataTypes.ENUM('active', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'active',
      },
      purchaseSource: {
        type: DataTypes.ENUM('standalone', 'package_bundle'),
        allowNull: false,
        defaultValue: 'standalone',
      },
      renewalNotifiedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'MembershipCard',
      tableName: 'membershipcard',
      freezeTableName: true,
      timestamps: true,
      indexes: [{ fields: ['memberId'] }, { fields: ['gymId'] }, { fields: ['status', 'endDate'] }],
    }
  );

  return MembershipCard;
};
