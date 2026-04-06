'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('equipmenttransferitem', 'selectedUnitIds', {
      type: Sequelize.TEXT,
      allowNull: true,
      after: 'quantity',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('equipmenttransferitem', 'selectedUnitIds');
  },
};