'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('TrainerShare', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      trainerId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Trainer', key: 'id' } // OK
      },
      fromGymId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Gym', key: 'id' } // OK
      },
      toGymId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Gym', key: 'id' } // OK
      },
      shareType: { type: Sequelize.STRING },
      startDate: { type: Sequelize.DATE },
      endDate: { type: Sequelize.DATE },
      commissionSplit: { type: Sequelize.FLOAT },
      status: { type: Sequelize.STRING },
      requestedBy: { 
        type: Sequelize.INTEGER,
        references: { model: 'User', key: 'id' } // OK
      },
      approvedBy: { 
        type: Sequelize.INTEGER,
        references: { model: 'User', key: 'id' } // OK
      },
      notes: { type: Sequelize.TEXT },
      policyId: { 
        type: Sequelize.INTEGER,
        // XÓA references TẠM THỜI
        // references: { model: 'Policy', key: 'id' }
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('TrainerShare');
  }
};