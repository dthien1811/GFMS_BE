'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('equipmentunit', 'usageStatus', {
      type: Sequelize.ENUM('in_stock', 'in_use'),
      allowNull: false,
      defaultValue: 'in_stock',
      after: 'status',
    });

    await queryInterface.addIndex('equipmentunit', ['usageStatus'], {
      name: 'equipmentunit_usage_status_idx',
    });

    await queryInterface.sequelize.query(`
      UPDATE equipmentunit
      SET usageStatus = 'in_stock'
      WHERE usageStatus IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('equipmentunit', 'equipmentunit_usage_status_idx');
    await queryInterface.removeColumn('equipmentunit', 'usageStatus');
  },
};