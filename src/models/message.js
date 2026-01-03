'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Message extends Model {
    static associate(models) {
      Message.belongsTo(models.User, { foreignKey: 'senderId', as: 'sender' });
      Message.belongsTo(models.User, { foreignKey: 'receiverId', as: 'receiver' });
    }
  };
  Message.init({
    senderId: DataTypes.INTEGER,
    receiverId: DataTypes.INTEGER,
    content: DataTypes.TEXT,
    isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
    readAt: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'Message',
  });
  return Message;
};