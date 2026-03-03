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
      TrainerShare.belongsTo(models.User, { foreignKey: 'acceptedBy', as: 'accepter' });
      TrainerShare.belongsTo(models.User, { foreignKey: 'rejectedBy', as: 'rejecter' });
      TrainerShare.belongsTo(models.Policy, { foreignKey: 'policyId' });
      TrainerShare.belongsTo(models.Member, { foreignKey: 'memberId' });

      // ✅ NEW: overrides theo thời gian
      if (models.TrainerShareOverride) {
        TrainerShare.hasMany(models.TrainerShareOverride, {
          foreignKey: "trainerShareId",
          as: "overrides",
        });
      }
    }
  };
  TrainerShare.init({
    trainerId: DataTypes.INTEGER,
    fromGymId: DataTypes.INTEGER,
    toGymId: DataTypes.INTEGER,
    shareType: DataTypes.STRING,
    startDate: DataTypes.DATE,
    endDate: DataTypes.DATE,
    startTime: DataTypes.TIME,
    endTime: DataTypes.TIME,
    scheduleMode: DataTypes.STRING,
    specificSchedules: DataTypes.JSON,
    weekdaySchedules: DataTypes.JSON,
    commissionSplit: DataTypes.FLOAT,
    status: DataTypes.STRING, // waiting_acceptance, pending, approved, rejected, rejected_by_partner
    requestedBy: DataTypes.INTEGER,
    memberId: DataTypes.INTEGER, // Optional: member để tạo booking khi approve
    approvedBy: DataTypes.INTEGER,
    acceptedBy: DataTypes.INTEGER,
    acceptedAt: DataTypes.DATE,
    rejectedBy: DataTypes.INTEGER,
    rejectedAt: DataTypes.DATE,
    notes: DataTypes.TEXT,
    policyId: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'TrainerShare',
    tableName: "trainershare"
  });
  return TrainerShare;
};
