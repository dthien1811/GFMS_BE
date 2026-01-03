'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Transaction', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      transactionCode: { type: Sequelize.STRING },
      memberId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Member', key: 'id' } // SỐ ÍT
      },
      trainerId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Trainer', key: 'id' } // SỐ ÍT
      },
      gymId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Gym', key: 'id' } // SỐ ÍT
      },
      packageId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Package', key: 'id' } // SỐ ÍT
      },
      amount: { type: Sequelize.DECIMAL(10, 2) },
      transactionType: { type: Sequelize.STRING },
      paymentMethod: { type: Sequelize.STRING },
      paymentStatus: { type: Sequelize.STRING },
      description: { type: Sequelize.TEXT },
      metadata: { type: Sequelize.JSON },
      transactionDate: { type: Sequelize.DATE },
      // ========== THÊM MỚI ==========
      packageActivationId: { 
        type: Sequelize.INTEGER,
        references: { model: 'PackageActivation', key: 'id' } // SỐ ÍT
      },
      processedBy: { 
        type: Sequelize.INTEGER,
        references: { model: 'User', key: 'id' } // SỐ ÍT
      },
      commissionAmount: { type: Sequelize.DECIMAL(10, 2) },
      ownerAmount: { type: Sequelize.DECIMAL(10, 2) },
      platformFee: { type: Sequelize.DECIMAL(10, 2) },
      // ==============================
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Transaction'); // SỐ ÍT
  }
};