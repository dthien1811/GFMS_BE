'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Member extends Model {
    static associate(models) {
      Member.belongsTo(models.User, { foreignKey: 'userId' });
      Member.belongsTo(models.Gym, { foreignKey: 'gymId' });

      Member.belongsTo(models.Package, { foreignKey: 'currentPackageId', as: 'currentPackage' });
      Member.belongsTo(models.PackageActivation, { foreignKey: 'packageActivationId' });

      // Add hasMany for all package activations
      Member.hasMany(models.PackageActivation, { foreignKey: 'memberId', as: 'PackageActivations' });

      Member.hasMany(models.Booking, { foreignKey: 'memberId' });
      Member.hasMany(models.Transaction, { foreignKey: 'memberId' });
      Member.hasMany(models.Review, { foreignKey: 'memberId' });
      Member.hasMany(models.Attendance, { foreignKey: 'memberId' });
    }
  }

  Member.init(
    {
      userId: { type: DataTypes.INTEGER, allowNull: false },
      gymId: { type: DataTypes.INTEGER, allowNull: false },

      membershipNumber: { type: DataTypes.STRING, allowNull: true },

      joinDate: { type: DataTypes.DATE, allowNull: true },
      expiryDate: { type: DataTypes.DATE, allowNull: true },

      height: { type: DataTypes.FLOAT, allowNull: true },
      weight: { type: DataTypes.FLOAT, allowNull: true },

      fitnessGoal: { type: DataTypes.TEXT, allowNull: true },

      status: {
        type: DataTypes.ENUM('active', 'inactive', 'suspended'),
        allowNull: false,
        defaultValue: 'active',
      },

      notes: { type: DataTypes.TEXT, allowNull: true },

      currentPackageId: { type: DataTypes.INTEGER, allowNull: true },
      packageActivationId: { type: DataTypes.INTEGER, allowNull: true },

      sessionsRemaining: { type: DataTypes.INTEGER, allowNull: true },
      packageExpiryDate: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Member',
      tableName: 'member',
      freezeTableName: true,
      timestamps: true,
      indexes: [{ fields: ['userId'] }, { fields: ['gymId'] }, { fields: ['membershipNumber'] }],
    }
  );

  return Member;
};
