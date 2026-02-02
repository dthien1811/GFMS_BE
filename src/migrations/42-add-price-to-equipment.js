'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('equipment', 'price', {
      type: Sequelize.DECIMAL(15, 2),
      defaultValue: 0,
      allowNull: false,
      comment: 'Base price for equipment'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('equipment', 'price');
  }
};
