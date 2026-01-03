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
  };
  Maintenance.init({
    equipmentId: DataTypes.INTEGER,
    gymId: DataTypes.INTEGER,
    issueDescription: DataTypes.TEXT,
    priority: DataTypes.STRING,
    requestedBy: DataTypes.INTEGER,
    assignedTo: DataTypes.INTEGER,
    estimatedCost: DataTypes.DECIMAL,
    actualCost: DataTypes.DECIMAL,
    status: DataTypes.STRING,
    scheduledDate: DataTypes.DATE,
    completionDate: DataTypes.DATE,
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'Maintenance',
  });
  return Maintenance;
};