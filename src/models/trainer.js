'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Trainer extends Model {
    static associate(models) {
      // 1-1 / 1-n core
      if (models.User) Trainer.belongsTo(models.User, { foreignKey: 'userId' });
      if (models.Gym) Trainer.belongsTo(models.Gym, { foreignKey: 'gymId' });

      if (models.Booking) Trainer.hasMany(models.Booking, { foreignKey: 'trainerId' });
      if (models.Transaction) Trainer.hasMany(models.Transaction, { foreignKey: 'trainerId' });
      if (models.Withdrawal) Trainer.hasMany(models.Withdrawal, { foreignKey: 'trainerId' });

      // Sharing PT between gyms (DB của bạn có TrainerShare)
      if (models.TrainerShare) Trainer.hasMany(models.TrainerShare, { foreignKey: 'trainerId' });

      // Optional relations
      if (models.SessionProgress) Trainer.hasMany(models.SessionProgress, { foreignKey: 'trainerId' });
      if (models.TrainerShare) Trainer.hasMany(models.TrainerShare, { foreignKey: 'trainerId' });

      if (models.Commission) Trainer.hasMany(models.Commission, { foreignKey: 'trainerId' });
      if (models.Review) Trainer.hasMany(models.Review, { foreignKey: 'trainerId' });
    }
  }

  Trainer.init(
    {
      userId: DataTypes.INTEGER,
      gymId: DataTypes.INTEGER,
      specialization: DataTypes.STRING,
      certification: DataTypes.STRING,
      experienceYears: DataTypes.INTEGER,
      hourlyRate: DataTypes.DECIMAL,
      commissionRate: DataTypes.FLOAT,
      rating: DataTypes.FLOAT,
      totalSessions: DataTypes.INTEGER,
      status: DataTypes.STRING,
      bio: DataTypes.TEXT,

      availableHours: {
        type: DataTypes.JSON,
        defaultValue: {
          monday: [{ start: '09:00', end: '18:00' }],
          tuesday: [{ start: '09:00', end: '18:00' }],
          wednesday: [{ start: '09:00', end: '18:00' }],
          thursday: [{ start: '09:00', end: '18:00' }],
          friday: [{ start: '09:00', end: '18:00' }],
          saturday: [{ start: '09:00', end: '15:00' }],
          sunday: []
        }
      },

      preferredGyms: {
        type: DataTypes.JSON,
        defaultValue: []
      },

      maxSessionsPerDay: {
        type: DataTypes.INTEGER,
        defaultValue: 5
      },

      minBookingNotice: {
        type: DataTypes.INTEGER,
        defaultValue: 24
      },

      isAvailableForShare: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },

      languages: {
        type: DataTypes.JSON,
        defaultValue: ['Vietnamese', 'English']
      },

      socialLinks: {
        type: DataTypes.JSON,
        defaultValue: {}
      },

      // payouts
      totalEarned: {
        type: DataTypes.DECIMAL,
        defaultValue: 0
      },

      pendingCommission: {
        type: DataTypes.DECIMAL,
        defaultValue: 0
      },

      lastPayoutDate: DataTypes.DATE,
      payoutMethod: DataTypes.STRING,

      bankAccountInfo: {
        type: DataTypes.JSON,
        defaultValue: {}
      },

      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      sequelize,
      modelName: 'Trainer',
      tableName: 'trainer' // ✅ đảm bảo trùng với bảng trong MySQL (ảnh DESCRIBE trainer)
    }
  );

  return Trainer;
};
