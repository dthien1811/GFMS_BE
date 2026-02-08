'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Thêm các trường mới cho flow chấp nhận của Owner B
    await queryInterface.addColumn('trainershare', 'acceptedBy', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'user', key: 'id' },
      comment: 'Owner B (chủ toGym) chấp nhận yêu cầu'
    });

    await queryInterface.addColumn('trainershare', 'acceptedAt', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Thời điểm Owner B chấp nhận'
    });

    await queryInterface.addColumn('trainershare', 'rejectedBy', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'user', key: 'id' },
      comment: 'User từ chối (Owner B hoặc Admin)'
    });

    await queryInterface.addColumn('trainershare', 'rejectedAt', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Thời điểm từ chối'
    });

    await queryInterface.addColumn('trainershare', 'scheduleMode', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: 'all_days',
      comment: 'all_days, specific_days, weekdays'
    });

    await queryInterface.addColumn('trainershare', 'specificSchedules', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Array of {date, startTime, endTime}'
    });

    await queryInterface.addColumn('trainershare', 'weekdaySchedules', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Object {monday: {startTime, endTime}, ...}'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('trainershare', 'acceptedBy');
    await queryInterface.removeColumn('trainershare', 'acceptedAt');
    await queryInterface.removeColumn('trainershare', 'rejectedBy');
    await queryInterface.removeColumn('trainershare', 'rejectedAt');
    await queryInterface.removeColumn('trainershare', 'scheduleMode');
    await queryInterface.removeColumn('trainershare', 'specificSchedules');
    await queryInterface.removeColumn('trainershare', 'weekdaySchedules');
  }
};
