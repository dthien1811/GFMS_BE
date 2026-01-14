'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Notification extends Model {
    static associate(models) {
      Notification.belongsTo(models.User, { foreignKey: 'userId' });
    }
  }

  Notification.init(
    {
      userId: { type: DataTypes.INTEGER, allowNull: false },

      title: { type: DataTypes.STRING, allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },

      notificationType: { type: DataTypes.STRING, allowNull: true },

      relatedId: { type: DataTypes.INTEGER, allowNull: true },
      relatedType: { type: DataTypes.STRING, allowNull: true },

      isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      sequelize,
      modelName: 'Notification',
      tableName: 'notification',
      freezeTableName: true,
      timestamps: true,
      indexes: [{ fields: ['userId'] }, { fields: ['isRead'] }, { fields: ['notificationType'] }],
    }
  );

  return Notification;
};
