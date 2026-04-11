"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable("trainershare");
    if (!table.borrowSpecialization) {
      await queryInterface.addColumn("trainershare", "borrowSpecialization", {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable("trainershare");
    if (table.borrowSpecialization) {
      await queryInterface.removeColumn("trainershare", "borrowSpecialization");
    }
  },
};
