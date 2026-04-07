'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('equipmentunitevent', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      equipmentUnitId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'equipmentunit',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
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
        allowNull: true,
        references: {
          model: 'gym',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      fromGymId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'gym',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      toGymId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'gym',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      eventType: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      referenceType: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      referenceId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      performedBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'user',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      eventAt: {
        type: Sequelize.DATE,
        allowNull: false,
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

    await queryInterface.addIndex('equipmentunitevent', ['equipmentUnitId'], {
      name: 'equipmentunitevent_unit_idx',
    });
    await queryInterface.addIndex('equipmentunitevent', ['equipmentId'], {
      name: 'equipmentunitevent_equipment_idx',
    });
    await queryInterface.addIndex('equipmentunitevent', ['eventType'], {
      name: 'equipmentunitevent_type_idx',
    });
    await queryInterface.addIndex('equipmentunitevent', ['eventAt'], {
      name: 'equipmentunitevent_event_at_idx',
    });

    const units = await queryInterface.sequelize.query(
      `SELECT id, equipmentId, gymId, notes, createdAt, updatedAt FROM equipmentunit`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (units.length > 0) {
      await queryInterface.bulkInsert(
        'equipmentunitevent',
        units.map((unit) => ({
          equipmentUnitId: Number(unit.id),
          equipmentId: Number(unit.equipmentId),
          gymId: Number(unit.gymId),
          fromGymId: null,
          toGymId: null,
          eventType: 'created',
          referenceType: 'equipment_unit',
          referenceId: Number(unit.id),
          performedBy: null,
          notes: unit.notes || 'Backfilled initial unit event',
          metadata: JSON.stringify({ source: 'migration_backfill' }),
          eventAt: unit.createdAt || new Date(),
          createdAt: unit.createdAt || new Date(),
          updatedAt: unit.updatedAt || new Date(),
        }))
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('equipmentunitevent', 'equipmentunitevent_event_at_idx');
    await queryInterface.removeIndex('equipmentunitevent', 'equipmentunitevent_type_idx');
    await queryInterface.removeIndex('equipmentunitevent', 'equipmentunitevent_equipment_idx');
    await queryInterface.removeIndex('equipmentunitevent', 'equipmentunitevent_unit_idx');
    await queryInterface.dropTable('equipmentunitevent');
  },
};