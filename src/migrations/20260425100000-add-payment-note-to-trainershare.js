'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('trainershare', 'paymentNote', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Ghi chú khi owner xác nhận thanh toán cho bên cho mượn PT',
    });
  },

  async down (queryInterface) {
    await queryInterface.removeColumn('trainershare', 'paymentNote');
  },
};
