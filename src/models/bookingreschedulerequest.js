
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BookingRescheduleRequest extends Model {
    static associate(models) {
      BookingRescheduleRequest.belongsTo(models.Booking, { foreignKey: 'bookingId' });
      BookingRescheduleRequest.belongsTo(models.Member, { foreignKey: 'memberId' });
      BookingRescheduleRequest.belongsTo(models.Trainer, { foreignKey: 'trainerId' });
      BookingRescheduleRequest.belongsTo(models.User, { foreignKey: 'requestedByUserId', as: 'requestedByUser' });
      BookingRescheduleRequest.belongsTo(models.User, { foreignKey: 'processedByUserId', as: 'processedByUser' });
    }
  }

  BookingRescheduleRequest.init({
    bookingId: DataTypes.INTEGER,
    memberId: DataTypes.INTEGER,
    trainerId: DataTypes.INTEGER,
    requestedByUserId: DataTypes.INTEGER,
    processedByUserId: DataTypes.INTEGER,
    oldBookingDate: DataTypes.DATEONLY,
    oldStartTime: DataTypes.TIME,
    oldEndTime: DataTypes.TIME,
    requestedDate: DataTypes.DATEONLY,
    requestedStartTime: DataTypes.TIME,
    requestedEndTime: DataTypes.TIME,
    reason: DataTypes.TEXT,
    trainerResponseNote: DataTypes.TEXT,
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled', 'expired'),
      defaultValue: 'pending',
    },
    processedAt: DataTypes.DATE,
  }, {
    sequelize,
    modelName: 'BookingRescheduleRequest',
    tableName: 'booking_reschedule_request',
  });

  return BookingRescheduleRequest;
};
