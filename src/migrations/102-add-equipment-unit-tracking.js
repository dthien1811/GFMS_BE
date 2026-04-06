'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('equipmentunit', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      equipmentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'equipment',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      gymId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'gym',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      assetCode: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      serialNumber: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('active', 'in_maintenance', 'transfer_pending', 'disposed'),
        allowNull: false,
        defaultValue: 'active',
      },
      transferId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'equipmenttransfer',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addColumn('maintenance', 'equipmentUnitId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'equipmentunit',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      after: 'equipmentId',
    });

    await queryInterface.addIndex('equipmentunit', ['equipmentId', 'gymId'], {
      name: 'equipmentunit_equipment_gym_idx',
    });
    await queryInterface.addIndex('equipmentunit', ['status'], {
      name: 'equipmentunit_status_idx',
    });
    await queryInterface.addIndex('maintenance', ['equipmentUnitId'], {
      name: 'maintenance_equipment_unit_idx',
    });

    const stocks = await queryInterface.sequelize.query(
      `SELECT id, equipmentId, gymId, quantity, availableQuantity, reservedQuantity, createdAt, updatedAt
       FROM equipmentstock`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const rows = [];
    stocks.forEach((stock) => {
      const quantity = Math.max(0, Number(stock.quantity || 0));
      const activeCount = Math.min(quantity, Math.max(0, Number(stock.availableQuantity || 0)));
      const maintenanceCount = Math.min(
        Math.max(0, quantity - activeCount),
        Math.max(0, Number(stock.reservedQuantity || 0))
      );

      for (let index = 0; index < quantity; index += 1) {
        rows.push({
          equipmentId: Number(stock.equipmentId),
          gymId: Number(stock.gymId),
          assetCode: `BF-EQ-${stock.equipmentId}-GYM-${stock.gymId}-ST-${stock.id}-${index + 1}`,
          serialNumber: null,
          status: index < activeCount ? 'active' : index < activeCount + maintenanceCount ? 'in_maintenance' : 'active',
          transferId: null,
          notes: 'Backfilled from existing equipment stock',
          createdAt: stock.createdAt || new Date(),
          updatedAt: stock.updatedAt || new Date(),
        });
      }
    });

    if (rows.length > 0) {
      await queryInterface.bulkInsert('equipmentunit', rows);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('maintenance', 'maintenance_equipment_unit_idx');
    await queryInterface.removeColumn('maintenance', 'equipmentUnitId');
    await queryInterface.removeIndex('equipmentunit', 'equipmentunit_status_idx');
    await queryInterface.removeIndex('equipmentunit', 'equipmentunit_equipment_gym_idx');
    await queryInterface.dropTable('equipmentunit');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS `enum_equipmentunit_status`;').catch(() => {});
  },
};