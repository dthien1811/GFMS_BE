'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.belongsTo(models.Group, { foreignKey: 'groupId' });
      User.belongsToMany(models.Project, { through: 'ProjectUser' });
      
      // GFMS ASSOCIATIONS
      User.hasOne(models.Gym, { foreignKey: 'ownerId', as: 'ownedGym' });
      User.hasOne(models.Member, { foreignKey: 'userId' });
      User.hasOne(models.Trainer, { foreignKey: 'userId' });
      User.hasMany(models.Notification, { foreignKey: 'userId' });
      User.hasMany(models.AuditLog, { foreignKey: 'userId' });
      User.hasMany(models.Maintenance, { foreignKey: 'requestedBy', as: 'maintenanceRequests' });
      User.hasMany(models.Maintenance, { foreignKey: 'assignedTo', as: 'assignedMaintenance' });
      User.hasMany(models.FranchiseRequest, { foreignKey: 'requesterId', as: 'franchiseRequests' });
      User.hasMany(models.FranchiseRequest, { foreignKey: 'reviewedBy', as: 'reviewedFranchises' });
      User.hasMany(models.TrainerShare, { foreignKey: 'requestedBy', as: 'shareRequests' });
      User.hasMany(models.TrainerShare, { foreignKey: 'approvedBy', as: 'approvedShares' });
      User.hasMany(models.Withdrawal, { foreignKey: 'processedBy', as: 'processedWithdrawals' });
      User.hasMany(models.Attendance, { foreignKey: 'userId' });
      User.hasMany(models.Booking, { foreignKey: 'createdBy', as: 'createdBookings' });
      User.hasMany(models.Booking, { foreignKey: 'cancellationBy', as: 'cancelledBookings' });
      
      // ========== THÊM MỚI ==========
      User.hasMany(models.Transaction, { 
        foreignKey: 'processedBy', 
        as: 'processedTransactions' 
      });
      User.hasMany(models.Message, { 
        foreignKey: 'senderId', 
        as: 'sentMessages' 
      });
      User.hasMany(models.Message, { 
        foreignKey: 'receiverId', 
        as: 'receivedMessages' 
      });
      // ==============================
    }
  };
  User.init({
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    address: DataTypes.STRING,
    sex: {
      type: DataTypes.ENUM('male', 'female', 'other'),
      defaultValue: 'male'
    },
    phone: {
      type: DataTypes.STRING,
      validate: {
        is: /^[0-9]{10,11}$/
      }
    },
    groupId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Group',
        key: 'id'
      }
    },
    avatar: {
      type: DataTypes.STRING,
      defaultValue: 'default-avatar.png'
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'suspended'),
      defaultValue: 'active'
    },
    lastLogin: DataTypes.DATE,
    emailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    resetPasswordToken: DataTypes.STRING,
    resetPasswordExpires: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'User',
    timestamps: true
  });
  return User;
};