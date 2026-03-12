"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("member", "currentBmi", {
      type: Sequelize.FLOAT,
      allowNull: true,
    });

    await queryInterface.addColumn("member", "bmiUpdatedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn("member", "targetWeight", {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("member", "targetWeight");
    await queryInterface.removeColumn("member", "bmiUpdatedAt");
    await queryInterface.removeColumn("member", "currentBmi");
  },
};