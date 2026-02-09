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
  }

  Transaction.init(
    {
      transactionCode: DataTypes.STRING, // ✅ FIX cú pháp (không có :_toggle)
      memberId: DataTypes.INTEGER,
      trainerId: DataTypes.INTEGER,
      gymId: DataTypes.INTEGER,
      packageId: DataTypes.INTEGER,
      amount: DataTypes.DECIMAL,

      transactionType: {
        type: DataTypes.STRING,
        validate: {
          isIn: [[
            'package_purchase',
            'package_renewal',
            'booking_payment',
            'refund',
            'commission',
            'withdrawal',
            'equipment_purchase',
            'maintenance', // ✅ ADD để complete maintenance không lỗi
            'other'
          ]]
        }
      },

      paymentMethod: DataTypes.STRING,

      paymentStatus: {
        type: DataTypes.STRING,
        validate: {
          isIn: [['pending', 'completed', 'failed', 'refunded', 'cancelled']]
        }
      },

      description: DataTypes.TEXT,
      metadata: DataTypes.JSON,
      transactionDate: DataTypes.DATE,

      // ========== THÊM MỚI ==========
      packageActivationId: DataTypes.INTEGER,
      processedBy: DataTypes.INTEGER,
      commissionAmount: DataTypes.DECIMAL,
      ownerAmount: DataTypes.DECIMAL,
      platformFee: DataTypes.DECIMAL,
      // ==============================
    },
    {
      sequelize,
      modelName: 'Transaction',
      tableName: 'transaction',
    }
  );

  return Transaction;
};
