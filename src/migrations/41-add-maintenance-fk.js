// Tạo file 41-add-maintenance-fk.js
'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addConstraint('maintenance', {
      fields: ['equipmentId'],
      type: 'foreign key',
      name: 'fk_maintenance_equipment',
      references: {
        table: 'equipment',
        field: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeConstraint('maintenance', 'fk_maintenance_equipment');
  }
};