'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MembershipCardPlan extends Model {
    static associate(models) {
      MembershipCardPlan.belongsTo(models.Gym, { foreignKey: 'gymId' });
      MembershipCardPlan.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
    }
  }

  MembershipCardPlan.init(
    {
      gymId: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      months: { type: DataTypes.INTEGER, allowNull: false },
      price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      imageUrl: { type: DataTypes.TEXT, allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdBy: { type: DataTypes.INTEGER, allowNull: false },
    },
    {
      sequelize,
      modelName: 'MembershipCardPlan',
      tableName: 'membershipcardplan',
      freezeTableName: true,
      timestamps: true,
      indexes: [{ fields: ['gymId'] }, { fields: ['gymId', 'isActive'] }, { fields: ['months'] }],
    }
  );

  return MembershipCardPlan;
};
