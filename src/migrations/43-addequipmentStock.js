'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // EquipmentStock table name trong migration 37 là 'EquipmentStock'
    await queryInterface.addColumn('equipmentstock', 'damagedQuantity', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      after: 'availableQuantity',
    });

    await queryInterface.addColumn('equipmentstock', 'maintenanceQuantity', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      after: 'damagedQuantity',
    });

    // (Tuỳ chọn) đảm bảo availableQuantity không null (nếu DB cũ bị null)
    // await queryInterface.changeColumn('EquipmentStock', 'availableQuantity', {
    //   type: Sequelize.INTEGER,
    //   allowNull: false,
    //   defaultValue: 0,
    // });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('equipmentstock', 'maintenanceQuantity');
    await queryInterface.removeColumn('equipmentstock', 'damagedQuantity');
  },
};
