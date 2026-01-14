'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('gym', 'operatingHours', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Giờ hoạt động của gym (JSON format)'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('gym', 'operatingHours');
  }
};

