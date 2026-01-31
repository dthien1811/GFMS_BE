'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Bước 1: Update các giá trị không hợp lệ thành 'active'
    await queryInterface.sequelize.query(
      "UPDATE packageactivation SET status = 'active' WHERE status NOT IN ('active', 'expired', 'cancelled', 'completed')"
    );

    // Bước 2: Tạm thời thay đổi column thành VARCHAR để xóa ENUM constraint
    await queryInterface.changeColumn('packageactivation', 'status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'active'
    });

    // Bước 3: Thay đổi lại thành ENUM với giá trị đúng
    await queryInterface.changeColumn('packageactivation', 'status', {
      type: Sequelize.ENUM('active', 'expired', 'cancelled', 'completed'),
      allowNull: false,
      defaultValue: 'active'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Rollback về VARCHAR rồi về ENUM cũ
    await queryInterface.changeColumn('packageactivation', 'status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'active'
    });

    await queryInterface.changeColumn('packageactivation', 'status', {
      type: Sequelize.ENUM('active', 'expired', 'cancelled'),
      allowNull: false,
      defaultValue: 'active'
    });
  }
};
