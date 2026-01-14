'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('member', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { 
        type: Sequelize.INTEGER,
        references: { model: 'user', key: 'id' }
      },
      gymId: { 
        type: Sequelize.INTEGER,
        references: { model: 'gym', key: 'id' }
      },
      membershipNumber: { type: Sequelize.STRING },
      joinDate: { type: Sequelize.DATE },
      expiryDate: { type: Sequelize.DATE },
      height: { type: Sequelize.FLOAT },
      weight: { type: Sequelize.FLOAT },
      fitnessGoal: { type: Sequelize.TEXT },
      status: { type: Sequelize.STRING },
      notes: { type: Sequelize.TEXT },
      currentPackageId: { 
        type: Sequelize.INTEGER,
        references: { model: 'package', key: 'id' }
      },
      packageActivationId: { type: Sequelize.INTEGER }, // NO FK TEMP
      sessionsRemaining: { type: Sequelize.INTEGER },
      packageExpiryDate: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('member');
  }
};