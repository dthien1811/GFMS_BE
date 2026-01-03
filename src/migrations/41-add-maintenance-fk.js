// Tạo file 41-add-maintenance-fk.js
'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addConstraint('Maintenance', {
      fields: ['equipmentId'],
      type: 'foreign key',
      name: 'fk_maintenance_equipment',
      references: {
        table: 'Equipment',
        field: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeConstraint('Maintenance', 'fk_maintenance_equipment');
  }
};