'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class AuditLog extends Model {
    static associate(models) {
      AuditLog.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };
  AuditLog.init({
    userId: DataTypes.INTEGER,
    action: DataTypes.STRING,
    tableName: DataTypes.STRING,
    recordId: DataTypes.INTEGER,
    oldValues: DataTypes.JSON,
    newValues: DataTypes.JSON,
    ipAddress: DataTypes.STRING,
    userAgent: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'AuditLog',
  });
  return AuditLog;
};