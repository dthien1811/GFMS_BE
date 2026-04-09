'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('trainer');
    if (!table.gymId) {
      await queryInterface.addColumn('trainer', 'gymId', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
      await queryInterface.addIndex('trainer', ['gymId'], {
        name: 'trainer_gymId_idx',
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('trainer');
    if (table.gymId) {
      const indexes = await queryInterface.showIndex('trainer');
      const hasIndex = indexes.some((idx) => idx.name === 'trainer_gymId_idx');
      if (hasIndex) {
        await queryInterface.removeIndex('trainer', 'trainer_gymId_idx');
      }
      await queryInterface.removeColumn('trainer', 'gymId');
    }
  },
};

