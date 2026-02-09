'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('package');
    if (!table.packageType) {
      await queryInterface.addColumn('package', 'packageType', {
        type: Sequelize.ENUM('membership', 'personal_training'),
        allowNull: false,
        defaultValue: 'membership',
        comment: 'membership: gói thành viên theo thời hạn, personal_training: gói PT theo buổi'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('package', 'packageType');
  }
};
