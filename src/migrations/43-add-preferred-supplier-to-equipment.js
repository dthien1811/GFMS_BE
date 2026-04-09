'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('equipment', 'preferredSupplierId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Preferred supplier for this equipment',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('equipment', 'preferredSupplierId');
  },
};

