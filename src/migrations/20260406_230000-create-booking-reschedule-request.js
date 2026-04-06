
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map((t) => (typeof t === "string" ? t : t.tableName));

    if (!tableNames.includes("booking_reschedule_request")) {
      await queryInterface.createTable("booking_reschedule_request", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        bookingId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'booking', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        memberId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'member', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        trainerId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'trainer', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        requestedByUserId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'user', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        processedByUserId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'user', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        oldBookingDate: { type: Sequelize.DATEONLY, allowNull: false },
        oldStartTime: { type: Sequelize.TIME, allowNull: false },
        oldEndTime: { type: Sequelize.TIME, allowNull: false },
        requestedDate: { type: Sequelize.DATEONLY, allowNull: false },
        requestedStartTime: { type: Sequelize.TIME, allowNull: false },
        requestedEndTime: { type: Sequelize.TIME, allowNull: false },
        reason: { type: Sequelize.TEXT, allowNull: true },
        trainerResponseNote: { type: Sequelize.TEXT, allowNull: true },
        status: {
          type: Sequelize.ENUM('pending', 'approved', 'rejected', 'cancelled', 'expired'),
          allowNull: false,
          defaultValue: 'pending',
        },
        processedAt: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('booking_reschedule_request', ['bookingId'], { name: 'idx_brr_bookingId' });
      await queryInterface.addIndex('booking_reschedule_request', ['trainerId', 'status'], { name: 'idx_brr_trainer_status' });
      await queryInterface.addIndex('booking_reschedule_request', ['memberId', 'status'], { name: 'idx_brr_member_status' });
    }

    const bookingTable = await queryInterface.describeTable('booking');
    if (!bookingTable.isRescheduled) {
      await queryInterface.addColumn('booking', 'isRescheduled', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!bookingTable.rescheduledAt) {
      await queryInterface.addColumn('booking', 'rescheduledAt', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
    if (!bookingTable.originalBookingDate) {
      await queryInterface.addColumn('booking', 'originalBookingDate', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }
    if (!bookingTable.originalStartTime) {
      await queryInterface.addColumn('booking', 'originalStartTime', {
        type: Sequelize.TIME,
        allowNull: true,
      });
    }
    if (!bookingTable.originalEndTime) {
      await queryInterface.addColumn('booking', 'originalEndTime', {
        type: Sequelize.TIME,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    try { await queryInterface.removeColumn('booking', 'originalEndTime'); } catch (e) {}
    try { await queryInterface.removeColumn('booking', 'originalStartTime'); } catch (e) {}
    try { await queryInterface.removeColumn('booking', 'originalBookingDate'); } catch (e) {}
    try { await queryInterface.removeColumn('booking', 'rescheduledAt'); } catch (e) {}
    try { await queryInterface.removeColumn('booking', 'isRescheduled'); } catch (e) {}
    try { await queryInterface.removeIndex('booking_reschedule_request', 'idx_brr_bookingId'); } catch (e) {}
    try { await queryInterface.removeIndex('booking_reschedule_request', 'idx_brr_trainer_status'); } catch (e) {}
    try { await queryInterface.removeIndex('booking_reschedule_request', 'idx_brr_member_status'); } catch (e) {}
    try { await queryInterface.dropTable('booking_reschedule_request'); } catch (e) {}
  },
};
