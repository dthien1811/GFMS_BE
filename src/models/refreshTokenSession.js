'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class RefreshTokenSession extends Model {
    static associate(models) {
      RefreshTokenSession.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    }
  }

  RefreshTokenSession.init(
    {
      userId: { type: DataTypes.INTEGER, allowNull: false },
      sessionId: { type: DataTypes.STRING(64), allowNull: false },
      familyId: { type: DataTypes.STRING(64), allowNull: false },
      tokenHash: { type: DataTypes.STRING(128), allowNull: false },
      replacedByTokenHash: { type: DataTypes.STRING(128), allowNull: true },
      revokedAt: { type: DataTypes.DATE, allowNull: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      rememberMe: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      lastUsedAt: { type: DataTypes.DATE, allowNull: true },
      createdByIp: { type: DataTypes.STRING(64), allowNull: true },
      userAgent: { type: DataTypes.STRING(512), allowNull: true },
    },
    {
      sequelize,
      modelName: 'RefreshTokenSession',
      tableName: 'refreshTokenSession',
      timestamps: true,
      indexes: [
        { fields: ['userId'] },
        { fields: ['sessionId'], unique: true },
        { fields: ['familyId'] },
      ],
    }
  );

  return RefreshTokenSession;
};
