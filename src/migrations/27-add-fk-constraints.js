'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('Adding foreign key constraints...');

    // 1. member.packageActivationId → packageactivation.id
    try {
      await queryInterface.addConstraint('member', {
        fields: ['packageActivationId'],
        type: 'foreign key',
        name: 'fk_member_packageactivation',
        references: { table: 'packageactivation', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    } catch (err) {}

    // 2. booking.packageActivationId → packageactivation.id
    try {
      await queryInterface.addConstraint('booking', {
        fields: ['packageActivationId'],
        type: 'foreign key',
        name: 'fk_booking_packageactivation',
        references: { table: 'packageactivation', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
    } catch (err) {}

    // 3. commission.activationId → packageactivation.id
    try {
      await queryInterface.addConstraint('commission', {
        fields: ['activationId'],
        type: 'foreign key',
        name: 'fk_commission_activation',
        references: { table: 'packageactivation', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
    } catch (err) {}

    // 4. packageactivation.memberId → member.id
    try {
      await queryInterface.addConstraint('packageactivation', {
        fields: ['memberId'],
        type: 'foreign key',
        name: 'fk_packageactivation_member',
        references: { table: 'member', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
    } catch (err) {}

    // 5. trainershare.policyId → policy.id
    try {
      await queryInterface.addConstraint('trainershare', {
        fields: ['policyId'],
        type: 'foreign key',
        name: 'fk_trainershare_policy',
        references: { table: 'policy', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    } catch (err) {}

    // 6. packageactivation.transactionId → transaction.id
    try {
      await queryInterface.addConstraint('packageactivation', {
        fields: ['transactionId'],
        type: 'foreign key',
        name: 'fk_packageactivation_transaction',
        references: { table: 'transaction', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    } catch (err) {}

    console.log('✅ All foreign keys added (or skipped)');
  },

  down: async (queryInterface, Sequelize) => {
    const constraints = [
      'fk_member_packageactivation',
      'fk_booking_packageactivation',
      'fk_commission_activation',
      'fk_packageactivation_member',
      'fk_trainershare_policy',
      'fk_packageactivation_transaction'
    ];

    const tables = [
      'member',
      'booking',
      'commission',
      'packageactivation',
      'trainershare',
      'transaction'
    ];

    for (const table of tables) {
      for (const constraint of constraints) {
        try {
          await queryInterface.removeConstraint(table, constraint);
        } catch (err) {}
      }
    }
  }
};
