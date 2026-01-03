'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Maintenance', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      equipmentId: { 
        type: Sequelize.INTEGER,
        // TẠM THỜI BỎ REFERENCES
        // references: { model: 'Equipment', key: 'id' }
      },
      gymId: { 
        type: Sequelize.INTEGER,
        references: { model: 'Gym', key: 'id' }
      },
      issueDescription: { type: Sequelize.TEXT },
      priority: { type: Sequelize.STRING },
      requestedBy: { 
        type: Sequelize.INTEGER,
        references: { model: 'User', key: 'id' }
      },
      assignedTo: { 
        type: Sequelize.INTEGER,
        references: { model: 'User', key: 'id' }
      },
      estimatedCost: { type: Sequelize.DECIMAL(10, 2) },
      actualCost: { type: Sequelize.DECIMAL(10, 2) },
      status: { type: Sequelize.STRING },
      scheduledDate: { type: Sequelize.DATE },
      completionDate: { type: Sequelize.DATE },
      notes: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Maintenance');
  }
};