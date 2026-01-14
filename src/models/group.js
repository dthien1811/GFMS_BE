'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Group extends Model {
    static associate(models) {
      Group.hasMany(models.User, { foreignKey: 'groupId' });
      Group.belongsToMany(models.Role, {
        through: models.GroupRole, // dùng model join thay vì string
        foreignKey: 'groupId',
        otherKey: 'roleId',
      });
    }
  }

  Group.init(
    {
      name: DataTypes.STRING,
      description: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: 'Group',
      tableName: 'group',      // ✅ QUAN TRỌNG: khớp DB (group)
      freezeTableName: true,   // ✅ để không bị plural hóa
      timestamps: true,
    }
  );

  return Group;
};
