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
    }
  };
  Booking.init({
    memberId: DataTypes.INTEGER,
    trainerId: DataTypes.INTEGER,
    gymId: DataTypes.INTEGER,
    packageId: DataTypes.INTEGER,
    bookingDate: DataTypes.DATE,
    startTime: DataTypes.TIME,
    endTime: DataTypes.TIME,
    sessionType: DataTypes.STRING,
    notes: DataTypes.TEXT,
    status: { 
      type: DataTypes.ENUM(
        'pending', 
        'confirmed', 
        'in_progress', 
        'completed', 
        'cancelled',
        'no_show'
      ), 
      defaultValue: 'pending' 
    },
    checkinTime: DataTypes.DATE,
    checkoutTime: DataTypes.DATE,
    sessionNotes: DataTypes.TEXT,
    // BỔ SUNG:
    cancellationReason: DataTypes.TEXT,
    noShowFee: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    createdBy: DataTypes.INTEGER, // Người tạo booking (member hoặc staff)
    cancellationDate: DataTypes.DATE, // Ngày huỷ
    cancellationBy: DataTypes.INTEGER, // Người huỷ
    rating: {
      type: DataTypes.INTEGER,
      validate: { min: 1, max: 5 }
    },
    reviewComment: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'Booking',
  });
  return Booking;
};