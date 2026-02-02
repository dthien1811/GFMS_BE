'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Cập nhật status từ isActive cho các bản ghi có status NULL
    await queryInterface.sequelize.query(`
      UPDATE package 
      SET status = CASE 
        WHEN isActive = true OR isActive IS NULL THEN 'ACTIVE'
        WHEN isActive = false THEN 'INACTIVE'
        ELSE 'ACTIVE'
      END
      WHERE status IS NULL
    `);

    // 2. Cập nhật isActive từ status cho các bản ghi có isActive NULL
    await queryInterface.sequelize.query(`
      UPDATE package 
      SET isActive = CASE 
        WHEN status = 'active' OR status = 'ACTIVE' THEN true
        WHEN status = 'inactive' OR status = 'INACTIVE' THEN false
        ELSE true
      END
      WHERE isActive IS NULL
    `);

    // 3. Cập nhật các trường NULL còn lại về giá trị mặc định
    await queryInterface.sequelize.query(`
      UPDATE package 
      SET 
        type = COALESCE(type, 'basic'),
        status = COALESCE(status, 'ACTIVE'),
        isActive = COALESCE(isActive, true),
        commissionRate = COALESCE(commissionRate, 0.6),
        validityType = COALESCE(validityType, 'months')
      WHERE type IS NULL 
        OR status IS NULL
        OR isActive IS NULL 
        OR commissionRate IS NULL 
        OR validityType IS NULL
    `);
    
    console.log('✅ Đã đồng bộ status và isActive, cập nhật các giá trị NULL');
  },

  down: async (queryInterface, Sequelize) => {
    console.log('⚠️ Không rollback - giữ nguyên dữ liệu đã đồng bộ');
  }
};
