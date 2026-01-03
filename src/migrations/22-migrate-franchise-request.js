'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('FranchiseRequest', { // SỐ ÍT
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      requesterId: { 
        type: Sequelize.INTEGER,
        references: { model: 'User', key: 'id' } // SỐ ÍT
      },
      businessName: { type: Sequelize.STRING },
      location: { type: Sequelize.STRING },
      contactPerson: { type: Sequelize.STRING },
      contactPhone: { type: Sequelize.STRING },
      contactEmail: { type: Sequelize.STRING },
      investmentAmount: { type: Sequelize.DECIMAL(15, 2) },
      businessPlan: { type: Sequelize.TEXT },
      status: { type: Sequelize.STRING },
      reviewedBy: { 
        type: Sequelize.INTEGER,
        references: { model: 'User', key: 'id' } // SỐ ÍT
      },
      reviewNotes: { type: Sequelize.TEXT },
      approvedDate: { type: Sequelize.DATE },
      contractSigned: { type: Sequelize.BOOLEAN },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('FranchiseRequest'); // SỐ ÍT
  }
};