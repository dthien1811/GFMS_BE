'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('booking', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      memberId: { 
        type: Sequelize.INTEGER,
        references: { model: 'member', key: 'id' } // SỐ ÍT
      },
      trainerId: { 
        type: Sequelize.INTEGER,
        references: { model: 'trainer', key: 'id' } // SỐ ÍT
      },
      gymId: { 
        type: Sequelize.INTEGER,
        references: { model: 'gym', key: 'id' } // SỐ ÍT
      },
      packageId: { 
        type: Sequelize.INTEGER,
        references: { model: 'package', key: 'id' } // SỐ ÍT
      },
      bookingDate: { type: Sequelize.DATE },
      startTime: { type: Sequelize.TIME },
      endTime: { type: Sequelize.TIME },
      sessionType: { type: Sequelize.STRING },
      notes: { type: Sequelize.TEXT },
      status: { 
        type: Sequelize.ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'),
        defaultValue: 'pending'
      },
      checkinTime: { type: Sequelize.DATE },
      checkoutTime: { type: Sequelize.DATE },
      sessionNotes: { type: Sequelize.TEXT },
      cancellationReason: { type: Sequelize.TEXT },
      noShowFee: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      createdBy: { 
        type: Sequelize.INTEGER,
        references: { model: 'user', key: 'id' } // SỐ ÍT
      },
      cancellationDate: { type: Sequelize.DATE },
      cancellationBy: { 
        type: Sequelize.INTEGER,
        references: { model: 'user', key: 'id' } // SỐ ÍT
      },
      rating: { type: Sequelize.INTEGER },
      reviewComment: { type: Sequelize.TEXT },
      // ========== THÊM MỚI ==========
      packageActivationId: { 
        type: Sequelize.INTEGER,
        references: { model: 'packageactivation', key: 'id' } // SỐ ÍT
      },
      sessionValue: { type: Sequelize.DECIMAL(10, 2) },
      commissionCalculated: { type: Sequelize.BOOLEAN, defaultValue: false },
      // ==============================
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('booking'); // SỐ ÍT
  }
};