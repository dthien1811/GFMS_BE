'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('payrollperiod', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      gymId: {
        type: Sequelize.INTEGER,
        references: { model: 'gym', key: 'id' },
      },
      startDate: { type: Sequelize.DATEONLY },
      endDate: { type: Sequelize.DATEONLY },
      status: {
        type: Sequelize.ENUM('closed', 'paid'),
        defaultValue: 'closed',
      },
      totalSessions: { type: Sequelize.INTEGER },
      totalAmount: { type: Sequelize.DECIMAL(12, 2) },
      createdBy: { type: Sequelize.INTEGER },
      paidAt: { type: Sequelize.DATE },
      notes: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('payrollitem', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      periodId: {
        type: Sequelize.INTEGER,
        references: { model: 'payrollperiod', key: 'id' },
      },
      trainerId: {
        type: Sequelize.INTEGER,
        references: { model: 'trainer', key: 'id' },
      },
      totalSessions: { type: Sequelize.INTEGER },
      totalAmount: { type: Sequelize.DECIMAL(12, 2) },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addColumn('commission', 'payrollPeriodId', {
      type: Sequelize.INTEGER,
      references: { model: 'payrollperiod', key: 'id' },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('commission', 'payrollPeriodId');
    await queryInterface.dropTable('payrollitem');
    await queryInterface.dropTable('payrollperiod');
  },
};
