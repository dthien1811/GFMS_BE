'use strict';

module.exports = {
  async up(queryInterface) {
    // 1) đảm bảo cột policyId tồn tại (đang có rồi), nên chỉ add constraint
    await queryInterface.addConstraint('trainershare', {
      fields: ['policyId'],
      type: 'foreign key',
      name: 'fk_trainershare_policyId_policy',
      references: {
        table: 'policy',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL', // hợp lý: xóa policy thì request vẫn tồn tại nhưng policyId = null
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      'trainershare',
      'fk_trainershare_policyId_policy'
    );
  },
};
