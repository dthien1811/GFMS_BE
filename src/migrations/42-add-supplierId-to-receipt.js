'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Receipt', 'supplierId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'Supplier', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      after: 'gymId',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Receipt', 'supplierId');
  },
};
