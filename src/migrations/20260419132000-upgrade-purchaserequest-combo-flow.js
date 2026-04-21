'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const addColumnIfMissing = async (table, column, definition) => {
      const tableDesc = await queryInterface.describeTable(table);
      if (!tableDesc[column]) {
        await queryInterface.addColumn(table, column, definition);
      }
    };

    await addColumnIfMissing('purchaserequest', 'comboId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'equipment_combo', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await addColumnIfMissing('purchaserequest', 'totalAmount', { type: Sequelize.DECIMAL(15, 2), allowNull: true, defaultValue: 0 });
    await addColumnIfMissing('purchaserequest', 'finalAmount', { type: Sequelize.DECIMAL(15, 2), allowNull: true, defaultValue: 0 });
    await addColumnIfMissing('purchaserequest', 'contactName', { type: Sequelize.STRING, allowNull: true });
    await addColumnIfMissing('purchaserequest', 'contactPhone', { type: Sequelize.STRING, allowNull: true });
    await addColumnIfMissing('purchaserequest', 'contactEmail', { type: Sequelize.STRING, allowNull: true });
    await addColumnIfMissing('purchaserequest', 'approvedAt', { type: Sequelize.DATE, allowNull: true });
    await addColumnIfMissing('purchaserequest', 'rejectedAt', { type: Sequelize.DATE, allowNull: true });
    await addColumnIfMissing('purchaserequest', 'shippingAt', { type: Sequelize.DATE, allowNull: true });
    await addColumnIfMissing('purchaserequest', 'confirmedReceivedAt', { type: Sequelize.DATE, allowNull: true });
    await addColumnIfMissing('purchaserequest', 'completedAt', { type: Sequelize.DATE, allowNull: true });
    await addColumnIfMissing('purchaserequest', 'rejectReason', { type: Sequelize.TEXT, allowNull: true });

    await queryInterface.changeColumn('purchaserequest', 'equipmentId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'equipment', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });

    await queryInterface.changeColumn('purchaserequest', 'quantity', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });

    await queryInterface.sequelize.query(`
      UPDATE purchaserequest
      SET totalAmount = COALESCE(totalAmount, payableAmount, quantity * expectedUnitPrice, 0),
          depositAmount = CASE
            WHEN COALESCE(depositAmount, 0) > 0 THEN depositAmount
            ELSE ROUND(COALESCE(totalAmount, payableAmount, quantity * expectedUnitPrice, 0) * 0.3, 2)
          END,
          finalAmount = CASE
            WHEN COALESCE(finalAmount, 0) > 0 THEN finalAmount
            ELSE ROUND(COALESCE(totalAmount, payableAmount, quantity * expectedUnitPrice, 0) * 0.7, 2)
          END,
          remainingAmount = CASE
            WHEN COALESCE(remainingAmount, 0) > 0 THEN remainingAmount
            ELSE ROUND(COALESCE(totalAmount, payableAmount, quantity * expectedUnitPrice, 0) * 0.7, 2)
          END
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('purchaserequest', 'comboId');
    await queryInterface.removeColumn('purchaserequest', 'totalAmount');
    await queryInterface.removeColumn('purchaserequest', 'finalAmount');
    await queryInterface.removeColumn('purchaserequest', 'contactName');
    await queryInterface.removeColumn('purchaserequest', 'contactPhone');
    await queryInterface.removeColumn('purchaserequest', 'contactEmail');
    await queryInterface.removeColumn('purchaserequest', 'approvedAt');
    await queryInterface.removeColumn('purchaserequest', 'rejectedAt');
    await queryInterface.removeColumn('purchaserequest', 'shippingAt');
    await queryInterface.removeColumn('purchaserequest', 'confirmedReceivedAt');
    await queryInterface.removeColumn('purchaserequest', 'completedAt');
    await queryInterface.removeColumn('purchaserequest', 'rejectReason');
    await queryInterface.changeColumn('purchaserequest', 'equipmentId', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'equipment', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await queryInterface.changeColumn('purchaserequest', 'quantity', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  },
};
