'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('maintenance');
    if (!table.targetCompletionDate) {
      await queryInterface.addColumn('maintenance', 'targetCompletionDate', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('maintenance');
    if (table.targetCompletionDate) {
      await queryInterface.removeColumn('maintenance', 'targetCompletionDate');
    }
  },
};
