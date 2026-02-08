'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('trainershare', 'startTime', {
      type: Sequelize.TIME,
      allowNull: true
    });
    
    await queryInterface.addColumn('trainershare', 'endTime', {
      type: Sequelize.TIME,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('trainershare', 'startTime');
    await queryInterface.removeColumn('trainershare', 'endTime');
  }
};
