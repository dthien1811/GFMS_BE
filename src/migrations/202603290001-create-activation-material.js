'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('activationmaterial', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      packageActivationId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'packageactivation', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      trainerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'trainer', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      materialKind: {
        type: Sequelize.ENUM('demo_video', 'training_plan'),
        allowNull: false,
      },
      sourceItemId: { type: Sequelize.STRING(128), allowNull: false },
      title: { type: Sequelize.STRING(512), allowNull: true },
      fileUrl: { type: Sequelize.TEXT, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('activationmaterial', ['packageActivationId'], {
      name: 'idx_activationmaterial_activation',
    });
    await queryInterface.addIndex('activationmaterial', ['trainerId'], {
      name: 'idx_activationmaterial_trainer',
    });
    await queryInterface.addIndex(
      'activationmaterial',
      ['packageActivationId', 'trainerId', 'materialKind', 'sourceItemId'],
      {
        unique: true,
        name: 'uniq_activationmaterial_source',
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('activationmaterial');
  },
};
