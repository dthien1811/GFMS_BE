'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Notification extends Model {
    static associate(models) {
      Notification.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };
  Notification.init({
    userId: DataTypes.INTEGER,
    title: DataTypes.STRING,
    message: DataTypes.TEXT,
    notificationType: DataTypes.STRING,
    relatedId: DataTypes.INTEGER,
    relatedType: DataTypes.STRING,
    isRead: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Notification',
  });
  return Notification;
};