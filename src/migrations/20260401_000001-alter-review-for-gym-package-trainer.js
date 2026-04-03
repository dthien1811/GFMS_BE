'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('review', 'gymId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'gym', key: 'id' },
    });
    await queryInterface.addColumn('review', 'packageId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'package', key: 'id' },
    });
    await queryInterface.addColumn('review', 'packageActivationId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'packageactivation', key: 'id' },
    });
    await queryInterface.addColumn('review', 'reviewType', {
      type: Sequelize.ENUM('trainer', 'gym', 'package'),
      allowNull: false,
      defaultValue: 'trainer',
    });
    await queryInterface.addIndex('review', ['memberId', 'reviewType']);
    await queryInterface.addIndex('review', ['trainerId']);
    await queryInterface.addIndex('review', ['gymId']);
    await queryInterface.addIndex('review', ['packageId']);
    await queryInterface.addIndex('review', ['packageActivationId']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('review', ['packageActivationId']);
    await queryInterface.removeIndex('review', ['packageId']);
    await queryInterface.removeIndex('review', ['gymId']);
    await queryInterface.removeIndex('review', ['trainerId']);
    await queryInterface.removeIndex('review', ['memberId', 'reviewType']);
    await queryInterface.removeColumn('review', 'reviewType');
    await queryInterface.removeColumn('review', 'packageActivationId');
    await queryInterface.removeColumn('review', 'packageId');
    await queryInterface.removeColumn('review', 'gymId');
  },
};
