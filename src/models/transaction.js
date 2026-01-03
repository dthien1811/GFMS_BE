'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Transaction extends Model {
    static associate(models) {
      Transaction.belongsTo(models.Member, { foreignKey: 'memberId' });
      Transaction.belongsTo(models.Trainer, { foreignKey: 'trainerId' });
      Transaction.belongsTo(models.Gym, { foreignKey: 'gymId' });
      Transaction.belongsTo(models.Package, { foreignKey: 'packageId' });
      Transaction.belongsTo(models.PackageActivation, { foreignKey: 'packageActivationId' });
      Transaction.belongsTo(models.User, { foreignKey: 'processedBy', as: 'processor' });
    }
  };
  Transaction.init({
    transactionCode: DataTypes.STRING,
    memberId: DataTypes.INTEGER,
    trainerId: DataTypes.INTEGER,
    gymId: DataTypes.INTEGER,
    packageId: DataTypes.INTEGER,
    amount: DataTypes.DECIMAL,
    transactionType: DataTypes.STRING,
    paymentMethod: DataTypes.STRING,
    paymentStatus: DataTypes.STRING,
    description: DataTypes.TEXT,
    metadata: DataTypes.JSON,
    transactionDate: DataTypes.DATE,
    // ========== THÊM MỚI ==========
    packageActivationId: DataTypes.INTEGER, // Link đến gói được kích hoạt
    processedBy: DataTypes.INTEGER, // User xử lý
    commissionAmount: DataTypes.DECIMAL, // Tiền hoa hồng PT
    ownerAmount: DataTypes.DECIMAL, // Tiền chủ gym nhận
    platformFee: DataTypes.DECIMAL, // Phí nền tảng
    // ==============================
  }, {
    sequelize,
    modelName: 'Transaction',
  });
  return Transaction;
};