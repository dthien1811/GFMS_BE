'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Role extends Model {
    static associate(models) {
      Role.belongsToMany(models.Group, {
        through: models.GroupRole,   // ✅ dùng model join
        foreignKey: 'roleId',
        otherKey: 'groupId',
      });
    }
  }

  Role.init(
    {
      url: DataTypes.STRING,
      description: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: 'Role',
      tableName: 'role',       // ✅ khớp DB (đa phần là role)
      freezeTableName: true,
      timestamps: true,
    }
  );

  return Role;
};
