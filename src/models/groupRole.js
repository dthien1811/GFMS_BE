'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class GroupRole extends Model {
    static associate(models) {
      GroupRole.belongsTo(models.Group, { foreignKey: 'groupId' });
      GroupRole.belongsTo(models.Role, { foreignKey: 'roleId' });
    }
  }

  GroupRole.init(
    {
      groupId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'groupId',
      },
      roleId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'roleId',
      },
    },
    {
      sequelize,
      modelName: 'GroupRole',
      tableName: 'grouprole',  // ✅ đổi theo tên bảng THẬT trong DB
      freezeTableName: true,
      timestamps: false,
    }
  );

  return GroupRole;
};
