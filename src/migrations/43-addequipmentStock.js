'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // EquipmentStock table name trong migration 37 là 'EquipmentStock'
    await queryInterface.addColumn('EquipmentStock', 'damagedQuantity', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      after: 'availableQuantity',
    });

    await queryInterface.addColumn('EquipmentStock', 'maintenanceQuantity', {
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
    await queryInterface.removeColumn('EquipmentStock', 'maintenanceQuantity');
    await queryInterface.removeColumn('EquipmentStock', 'damagedQuantity');
  },
};
