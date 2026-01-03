'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class TrainerShare extends Model {
    static associate(models) {
      TrainerShare.belongsTo(models.Trainer, { foreignKey: 'trainerId' });
      TrainerShare.belongsTo(models.Gym, { foreignKey: 'fromGymId', as: 'fromGym' });
      TrainerShare.belongsTo(models.Gym, { foreignKey: 'toGymId', as: 'toGym' });
      TrainerShare.belongsTo(models.User, { foreignKey: 'requestedBy', as: 'requester' });
      TrainerShare.belongsTo(models.User, { foreignKey: 'approvedBy', as: 'approver' });
      TrainerShare.belongsTo(models.Policy, { foreignKey: 'policyId' });
    }
  };
  TrainerShare.init({
    trainerId: DataTypes.INTEGER,
    fromGymId: DataTypes.INTEGER,
    toGymId: DataTypes.INTEGER,
    shareType: DataTypes.STRING,
    startDate: DataTypes.DATE,
    endDate: DataTypes.DATE,
    commissionSplit: DataTypes.FLOAT,
    status: DataTypes.STRING,
    requestedBy: DataTypes.INTEGER,
    approvedBy: DataTypes.INTEGER,
    notes: DataTypes.TEXT,
    policyId: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'TrainerShare',
  });
  return TrainerShare;
};