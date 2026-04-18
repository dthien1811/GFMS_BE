// models/Booking.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Booking extends Model {
    static associate(models) {
      Booking.hasOne(models.Attendance, { foreignKey: 'bookingId' });
      Booking.hasOne(models.SessionProgress, { foreignKey: 'bookingId' });

      Booking.belongsTo(models.Member, { foreignKey: 'memberId' });
      Booking.belongsTo(models.Trainer, { foreignKey: 'trainerId' });
      Booking.belongsTo(models.Gym, { foreignKey: 'gymId' });
      Booking.belongsTo(models.Package, { foreignKey: 'packageId' });
      Booking.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
      if (models.BookingRescheduleRequest) Booking.hasMany(models.BookingRescheduleRequest, { foreignKey: 'bookingId' });
      if (models.TrainerShare) {
        Booking.belongsTo(models.TrainerShare, { foreignKey: 'trainerShareId', as: 'trainerShare' });
      }

      // ✅ only if exists
      if (models.PackageActivation) {
        Booking.belongsTo(models.PackageActivation, { foreignKey: 'packageActivationId' });
      }
    }
  }

  Booking.init(
    {
      memberId: DataTypes.INTEGER,
      trainerId: DataTypes.INTEGER,
      gymId: DataTypes.INTEGER,
      packageId: DataTypes.INTEGER,
      packageActivationId: DataTypes.INTEGER,
      bookingDate: DataTypes.DATEONLY,
      startTime: DataTypes.TIME,
      endTime: DataTypes.TIME,
      sessionType: DataTypes.STRING,
      notes: DataTypes.TEXT,
      status: {
        type: DataTypes.ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'),
        defaultValue: 'pending',
      },
      checkinTime: DataTypes.DATE,
      checkoutTime: DataTypes.DATE,
      sessionNotes: DataTypes.TEXT,

      cancellationReason: DataTypes.TEXT,
      noShowFee: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
      createdBy: DataTypes.INTEGER,
      cancellationDate: DataTypes.DATE,
      cancellationBy: DataTypes.INTEGER,

      rating: { type: DataTypes.INTEGER, validate: { min: 1, max: 5 } },
      reviewComment: DataTypes.TEXT,
      isRescheduled: { type: DataTypes.BOOLEAN, defaultValue: false },
      rescheduledAt: DataTypes.DATE,
      originalBookingDate: DataTypes.DATEONLY,
      originalStartTime: DataTypes.TIME,
      originalEndTime: DataTypes.TIME,
      trainerShareId: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: 'Booking',
      tableName: 'booking',
    }
  );

  return Booking;
};
