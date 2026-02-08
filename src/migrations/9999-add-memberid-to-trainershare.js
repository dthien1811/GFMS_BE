'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('trainershare');
    if (!table.memberId) {
      await queryInterface.addColumn('trainershare', 'memberId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'member',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('trainershare', 'memberId');
  }
};
