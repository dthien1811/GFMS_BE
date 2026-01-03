'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Member extends Model {
    static associate(models) {
      // QUAN HỆ: Member thuộc về User (1-1)
      Member.belongsTo(models.User, { foreignKey: 'userId' });
      
      // QUAN HỆ: Member thuộc về Gym
      Member.belongsTo(models.Gym, { foreignKey: 'gymId' });
      
      // QUAN HỆ: Member thuộc về Package (current package)
      Member.belongsTo(models.Package, { 
        foreignKey: 'currentPackageId',
        as: 'currentPackage' // alias để phân biệt
      });
      
      // QUAN HỆ: Member thuộc về PackageActivation (sẽ thêm FK trong file 27)
      Member.belongsTo(models.PackageActivation, { 
        foreignKey: 'packageActivationId' 
      });
      
      // QUAN HỆ: Member có nhiều Booking
      Member.hasMany(models.Booking, { foreignKey: 'memberId' });
      
      // QUAN HỆ: Member có nhiều Transaction
      Member.hasMany(models.Transaction, { foreignKey: 'memberId' });
      
      // QUAN HỆ: Member có nhiều Review
      Member.hasMany(models.Review, { foreignKey: 'memberId' });
      
      // QUAN HỆ: Member có nhiều Attendance
      Member.hasMany(models.Attendance, { foreignKey: 'memberId' });
    }
  };
  
  Member.init({
    userId: DataTypes.INTEGER,
    gymId: DataTypes.INTEGER,
    membershipNumber: DataTypes.STRING,
    joinDate: DataTypes.DATE,
    expiryDate: DataTypes.DATE,
    height: DataTypes.FLOAT,
    weight: DataTypes.FLOAT,
    fitnessGoal: DataTypes.TEXT,
    status: DataTypes.STRING,
    notes: DataTypes.TEXT,
    currentPackageId: DataTypes.INTEGER,
    packageActivationId: DataTypes.INTEGER,
    sessionsRemaining: DataTypes.INTEGER,
    packageExpiryDate: DataTypes.DATE,
    // createdAt, updatedAt sẽ tự động thêm nếu timestamps: true
  }, {
    sequelize,
    modelName: 'Member',
    // timestamps: true, // Mặc định đã là true
    // Nếu muốn custom tên timestamp columns:
    // createdAt: 'createdAt',
    // updatedAt: 'updatedAt'
  });
  
  return Member;
};