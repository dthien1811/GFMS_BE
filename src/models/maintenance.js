'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Maintenance extends Model {
    static associate(models) {
      Maintenance.belongsTo(models.Equipment, { foreignKey: 'equipmentId' });
      Maintenance.belongsTo(models.Gym, { foreignKey: 'gymId' });

      Maintenance.belongsTo(models.User, { foreignKey: 'requestedBy', as: 'requester' });
      Maintenance.belongsTo(models.User, { foreignKey: 'assignedTo', as: 'technician' });
    }
  }

  Maintenance.init(
    {
      equipmentId: { type: DataTypes.INTEGER, allowNull: false },
      gymId: { type: DataTypes.INTEGER, allowNull: false },

      issueDescription: { type: DataTypes.TEXT, allowNull: false },

      priority: {
        type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
        allowNull: false,
        defaultValue: 'medium',
      },

      requestedBy: { type: DataTypes.INTEGER, allowNull: false },
      assignedTo: { type: DataTypes.INTEGER, allowNull: true },

      estimatedCost: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      actualCost: { type: DataTypes.DECIMAL(15, 2), allowNull: true },

      status: {
        type: DataTypes.ENUM('pending', 'assigned', 'in_progress', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },

      scheduledDate: { type: DataTypes.DATE, allowNull: true },
      completionDate: { type: DataTypes.DATE, allowNull: true },

      notes: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Maintenance',
      tableName: 'maintenance',
      freezeTableName: true,
      timestamps: true,
      indexes: [{ fields: ['gymId'] }, { fields: ['equipmentId'] }, { fields: ['status'] }],
    }
  );

  return Maintenance;
};
