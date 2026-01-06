'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Gym', 'images', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Danh sách URL hình ảnh của gym (JSON array format)'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Gym', 'images');
  }
};

