'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('Adding foreign key constraints...');
    
    // THỨ TỰ QUAN TRỌNG: Thêm FK cho bảng KHÔNG có vòng lặp trước
    
    // 1. Member.packageActivationId → PackageActivation.id
    try {
      await queryInterface.addConstraint('Member', {
        fields: ['packageActivationId'],
        type: 'foreign key',
        name: 'fk_member_packageactivation',
        references: { table: 'PackageActivation', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
      console.log('✓ Added fk_member_packageactivation');
    } catch (err) {
      console.log('⚠️ Skipping fk_member_packageactivation:', err.message);
    }
    
    // 2. Booking.packageActivationId → PackageActivation.id
    try {
      await queryInterface.addConstraint('Booking', {
        fields: ['packageActivationId'],
        type: 'foreign key',
        name: 'fk_booking_packageactivation',
        references: { table: 'PackageActivation', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
      console.log('✓ Added fk_booking_packageactivation');
    } catch (err) {
      console.log('⚠️ Skipping fk_booking_packageactivation:', err.message);
    }
    
    // 3. Commission.activationId → PackageActivation.id
    try {
      await queryInterface.addConstraint('Commission', {
        fields: ['activationId'],
        type: 'foreign key',
        name: 'fk_commission_activation',
        references: { table: 'PackageActivation', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
      console.log('✓ Added fk_commission_activation');
    } catch (err) {
      console.log('⚠️ Skipping fk_commission_activation:', err.message);
    }
    
    // 4. PackageActivation.memberId → Member.id (SAU khi Member đã có FK packageActivationId)
    try {
      await queryInterface.addConstraint('PackageActivation', {
        fields: ['memberId'],
        type: 'foreign key',
        name: 'fk_packageactivation_member',
        references: { table: 'Member', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
      console.log('✓ Added fk_packageactivation_member');
    } catch (err) {
      console.log('⚠️ Skipping fk_packageactivation_member:', err.message);
    }
    
    // 5. Thêm FK cho TrainerShare.policyId
    try {
      await queryInterface.addConstraint('TrainerShare', {
        fields: ['policyId'],
        type: 'foreign key',
        name: 'fk_trainershare_policy',
        references: { table: 'Policy', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
      console.log('✓ Added fk_trainershare_policy');
    } catch (err) {
      console.log('⚠️ Skipping fk_trainershare_policy:', err.message);
    }
    
    // 6. QUAN TRỌNG: XÓA 2 constraint có vòng lặp này, hoặc sửa thiết kế
    // PackageActivation.transactionId → Transaction.id
    // Transaction.packageActivationId → PackageActivation.id
    // => KHÔNG THỂ CÙNG TỒN TẠI!
    
    // Chỉ thêm MỘT trong 2:
    try {
      await queryInterface.addConstraint('PackageActivation', {
        fields: ['transactionId'],
        type: 'foreign key',
        name: 'fk_packageactivation_transaction',
        references: { table: 'Transaction', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
      console.log('✓ Added fk_packageactivation_transaction');
      console.log('⚠️ NOTE: Transaction.packageActivationId FK will NOT be added due to circular dependency');
    } catch (err) {
      console.log('⚠️ Skipping fk_packageactivation_transaction:', err.message);
    }
    
    // HOẶC ngược lại (chọn 1):
    // try {
    //   await queryInterface.addConstraint('Transaction', {
    //     fields: ['packageActivationId'],
    //     type: 'foreign key',
    //     name: 'fk_transaction_packageactivation',
    //     references: { table: 'PackageActivation', field: 'id' },
    //     onDelete: 'SET NULL',
    //     onUpdate: 'CASCADE'
    //   });
    //   console.log('✓ Added fk_transaction_packageactivation');
    // } catch (err) {
    //   console.log('⚠️ Skipping fk_transaction_packageactivation:', err.message);
    // }
    
    console.log('✅ All foreign keys added (or skipped)');
  },

  down: async (queryInterface, Sequelize) => {
    console.log('Removing foreign key constraints...');
    
    const constraints = [
      'fk_member_packageactivation',
      'fk_booking_packageactivation',
      'fk_commission_activation',
      'fk_packageactivation_member',
      'fk_trainershare_policy',
      'fk_packageactivation_transaction',
      'fk_transaction_packageactivation'
    ];
    
    const tables = ['Member', 'Booking', 'Commission', 'PackageActivation', 'TrainerShare', 'Transaction'];
    
    for (const constraint of constraints) {
      for (const table of tables) {
        try {
          await queryInterface.removeConstraint(table, constraint);
          console.log(`✓ Removed ${constraint} from ${table}`);
        } catch (err) {
          // Bỏ qua nếu constraint không tồn tại
        }
      }
    }
    
    console.log('✅ All foreign keys removed');
  }
};