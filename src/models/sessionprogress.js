// Cần thêm file: sessionprogress.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class SessionProgress extends Model {
    static associate(models) {
      SessionProgress.belongsTo(models.Member, { foreignKey: 'memberId' });
      SessionProgress.belongsTo(models.Booking, { foreignKey: 'bookingId' });
      SessionProgress.belongsTo(models.Attendance, { foreignKey: 'attendanceId' });
      SessionProgress.belongsTo(models.Trainer, { foreignKey: 'trainerId' });
    }
  };
  SessionProgress.init({
    memberId: DataTypes.INTEGER,
    bookingId: DataTypes.INTEGER,
    trainerId: DataTypes.INTEGER,
    weight: DataTypes.FLOAT,
    bodyFat: DataTypes.FLOAT,
    muscleMass: DataTypes.FLOAT,
    notes: DataTypes.TEXT,
    exercises: DataTypes.JSON, // Array of exercises with sets/reps
    sessionRating: DataTypes.INTEGER,
    completedAt: DataTypes.DATE,
    attendanceId: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'SessionProgress',
  });
  return SessionProgress;
};