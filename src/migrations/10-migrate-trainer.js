'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Trainer', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { 
        type: Sequelize.INTEGER,
        references: { model: 'User', key: 'id' } // SỐ ÍT
      },
      specialization: { type: Sequelize.STRING },
      certification: { type: Sequelize.STRING },
      experienceYears: { type: Sequelize.INTEGER },
      hourlyRate: { type: Sequelize.DECIMAL(10, 2) },
      commissionRate: { type: Sequelize.FLOAT },
      rating: { type: Sequelize.FLOAT },
      totalSessions: { type: Sequelize.INTEGER },
      status: { type: Sequelize.STRING },
      bio: { type: Sequelize.TEXT },
      availableHours: { 
        type: Sequelize.JSON,
        defaultValue: JSON.stringify({
          monday: [{ start: '09:00', end: '18:00' }],
          tuesday: [{ start: '09:00', end: '18:00' }],
          wednesday: [{ start: '09:00', end: '18:00' }],
          thursday: [{ start: '09:00', end: '18:00' }],
          friday: [{ start: '09:00', end: '18:00' }],
          saturday: [{ start: '09:00', end: '15:00' }],
          sunday: []
        })
      },
      preferredGyms: { type: Sequelize.JSON, defaultValue: JSON.stringify([]) },
      maxSessionsPerDay: { type: Sequelize.INTEGER, defaultValue: 5 },
      minBookingNotice: { type: Sequelize.INTEGER, defaultValue: 24 },
      isAvailableForShare: { type: Sequelize.BOOLEAN, defaultValue: true },
      languages: { type: Sequelize.JSON, defaultValue: JSON.stringify(['Vietnamese', 'English']) },
      socialLinks: { type: Sequelize.JSON, defaultValue: JSON.stringify({}) },
      // ========== THÊM MỚI ==========
      totalEarned: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      pendingCommission: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      lastPayoutDate: { type: Sequelize.DATE },
      payoutMethod: { type: Sequelize.STRING },
      bankAccountInfo: { type: Sequelize.JSON, defaultValue: JSON.stringify({}) },
      // ==============================
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Trainer'); // SỐ ÍT
  }
};