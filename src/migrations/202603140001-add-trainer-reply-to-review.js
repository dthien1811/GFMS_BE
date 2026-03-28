'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('review', 'trainerReply', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn('review', 'repliedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('review', 'repliedAt');
    await queryInterface.removeColumn('review', 'trainerReply');
  },
};
