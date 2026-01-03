'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class GroupRole extends Model {
    static associate(models) {
      GroupRole.belongsTo(models.Group, { foreignKey: 'groupId' });
      GroupRole.belongsTo(models.Role, { foreignKey: 'roleId' });
    }
  }

  GroupRole.init({
    groupId: DataTypes.INTEGER,
    roleId: DataTypes.INTEGER,
  }, {
    sequelize,
    modelName: 'GroupRole',
    tableName: 'GroupRole',
    timestamps: false
  });

  return GroupRole;
};
