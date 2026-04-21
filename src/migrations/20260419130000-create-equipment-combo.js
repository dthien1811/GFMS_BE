'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('equipment_combo', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING, allowNull: false },
      code: { type: Sequelize.STRING, allowNull: false, unique: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      price: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
      thumbnail: { type: Sequelize.TEXT, allowNull: true },
      supplierId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'supplier', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      isSelling: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.createTable('equipment_combo_item', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      comboId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'equipment_combo', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      equipmentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'equipment', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      note: { type: Sequelize.TEXT, allowNull: true },
      sortOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.addIndex('equipment_combo_item', ['comboId']);
    await queryInterface.addIndex('equipment_combo_item', ['equipmentId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('equipment_combo_item');
    await queryInterface.dropTable('equipment_combo');
  },
};
