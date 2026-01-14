'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Message extends Model {
    static associate(models) {
      Message.belongsTo(models.User, { foreignKey: 'senderId', as: 'sender' });
      Message.belongsTo(models.User, { foreignKey: 'receiverId', as: 'receiver' });
    }
  }

  Message.init(
    {
      senderId: { type: DataTypes.INTEGER, allowNull: false },
      receiverId: { type: DataTypes.INTEGER, allowNull: false },

      content: { type: DataTypes.TEXT, allowNull: false },

      isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      readAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Message',
      tableName: 'message',
      freezeTableName: true,
      timestamps: true,
      indexes: [{ fields: ['senderId'] }, { fields: ['receiverId'] }, { fields: ['isRead'] }],
    }
  );

  return Message;
};
