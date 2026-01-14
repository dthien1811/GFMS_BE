'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('receipt', 'supplierId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'supplier', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      after: 'gymId',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('receipt', 'supplierId');
  },
};
