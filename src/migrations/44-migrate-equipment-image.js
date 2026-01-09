"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("equipmentimage", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },

      equipmentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "equipment", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      url: { type: Sequelize.STRING, allowNull: false },
      isPrimary: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      sortOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      altText: { type: Sequelize.STRING, allowNull: true },

      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex("equipmentimage", ["equipmentId"], { name: "idx_equipmentimage_equipmentId" });
    await queryInterface.addIndex("equipmentimage", ["equipmentId", "isPrimary"], {
      name: "idx_equipmentimage_primary",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("equipmentimage");
  },
};
