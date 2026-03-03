"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = "equipmentimage";
    const desc = await queryInterface.describeTable(table);
    if (!desc.publicId) {
      await queryInterface.addColumn(table, "publicId", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = "equipmentimage";
    const desc = await queryInterface.describeTable(table);
    if (desc.publicId) {
      await queryInterface.removeColumn(table, "publicId");
    }
  },
};
