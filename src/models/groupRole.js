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
      },
      roleId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'GroupRole',
      tableName: 'grouprole', // đổi đúng theo DB bạn
      freezeTableName: true,
      timestamps: false,
      indexes: [{ fields: ['groupId'] }, { fields: ['roleId'] }],
    }
  );

  return GroupRole;
};
