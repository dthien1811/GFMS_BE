'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const addColumnIfMissing = async (table, column, definition) => {
      const tableDesc = await queryInterface.describeTable(table);
      if (!tableDesc[column]) {
        await queryInterface.addColumn(table, column, definition);
      }
    };

    await addColumnIfMissing('transaction', 'purchaseRequestId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'purchaserequest', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await addColumnIfMissing('transaction', 'paymentPhase', { type: Sequelize.ENUM('deposit', 'final'), allowNull: true });
    await addColumnIfMissing('transaction', 'paymentProvider', { type: Sequelize.STRING, allowNull: true });
    await addColumnIfMissing('transaction', 'payosOrderCode', { type: Sequelize.STRING, allowNull: true });
    await addColumnIfMissing('transaction', 'paymentLink', { type: Sequelize.TEXT, allowNull: true });
    await addColumnIfMissing('transaction', 'paidAt', { type: Sequelize.DATE, allowNull: true });
    await addColumnIfMissing('transaction', 'rawPayload', { type: Sequelize.JSON, allowNull: true });
    await addColumnIfMissing('transaction', 'expiresAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addIndex('transaction', ['purchaseRequestId']);
    await queryInterface.addIndex('transaction', ['paymentPhase']);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('transaction', 'purchaseRequestId');
    await queryInterface.removeColumn('transaction', 'paymentPhase');
    await queryInterface.removeColumn('transaction', 'paymentProvider');
    await queryInterface.removeColumn('transaction', 'payosOrderCode');
    await queryInterface.removeColumn('transaction', 'paymentLink');
    await queryInterface.removeColumn('transaction', 'paidAt');
    await queryInterface.removeColumn('transaction', 'rawPayload');
    await queryInterface.removeColumn('transaction', 'expiresAt');
  },
};
