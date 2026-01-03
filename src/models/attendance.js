// Cần thêm file: attendance.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Attendance extends Model {
    static associate(models) {
      Attendance.belongsTo(models.User, { foreignKey: 'userId' });
      Attendance.belongsTo(models.Gym, { foreignKey: 'gymId' });
      Attendance.belongsTo(models.Booking, { foreignKey: 'bookingId' });
    }
  };
  Attendance.init({
    userId: DataTypes.INTEGER,
    gymId: DataTypes.INTEGER,
    bookingId: DataTypes.INTEGER,
    checkInTime: DataTypes.DATE,
    checkOutTime: DataTypes.DATE,
    attendanceType: { type: DataTypes.ENUM('member', 'trainer') },
    method: { type: DataTypes.ENUM('qr', 'nfc', 'manual') },
    status: { type: DataTypes.ENUM('present', 'late', 'absent') }
  }, {
    sequelize,
    modelName: 'Attendance',
  });
  return Attendance;
};