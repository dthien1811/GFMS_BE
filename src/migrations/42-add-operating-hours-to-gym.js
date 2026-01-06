'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Gym', 'operatingHours', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Giờ hoạt động của gym (JSON format)'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Gym', 'operatingHours');
  }
};

