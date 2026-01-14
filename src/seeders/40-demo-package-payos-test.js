'use strict';

/**
 * Seeder tạo gói tập để test thanh toán PayOS
 * Chạy: npx sequelize-cli db:seed --seed 40-demo-package-payos-test.js
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Kiểm tra xem đã có gói test chưa (tránh duplicate)
    const existing = await queryInterface.sequelize.query(
      "SELECT id FROM `package` WHERE name LIKE '%PayOS Test%' LIMIT 1",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (existing && existing.length > 0) {
      console.log('[Seeder] Gói PayOS Test đã tồn tại, bỏ qua...');
      return;
    }

    // Lấy gymId đầu tiên (hoặc gymId = 1)
    const gyms = await queryInterface.sequelize.query(
      "SELECT id FROM `gym` LIMIT 1",
      { type: Sequelize.QueryTypes.SELECT }
    );

    const gymId = gyms?.[0]?.id || 1;

    await queryInterface.bulkInsert(
      'package',
      [
        {
          name: 'PayOS Test - Gói 1 Tháng',
          description: 'Gói test thanh toán PayOS - 1 tháng, 8 buổi PT. Giá test: 50,000 VNĐ',
          type: 'standard',
          durationDays: 30,
          price: 50000,
          sessions: 8,
          gymId,
          status: 'active',
          pricePerSession: 62500,
          commissionRate: 0.6,
          isActive: true,
          validityType: 'months',
          maxSessionsPerWeek: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'PayOS Test - Gói 3 Tháng',
          description: 'Gói test thanh toán PayOS - 3 tháng, 20 buổi PT. Giá test: 150,000 VNĐ',
          type: 'premium',
          durationDays: 90,
          price: 150000,
          sessions: 20,
          gymId,
          status: 'active',
          pricePerSession: 75000,
          commissionRate: 0.65,
          isActive: true,
          validityType: 'months',
          maxSessionsPerWeek: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'PayOS Test - Gói Rẻ (100k)',
          description: 'Gói test giá rẻ để test PayOS - 1 tháng, 4 buổi. Giá: 100,000 VNĐ',
          type: 'basic',
          durationDays: 30,
          price: 100000,
          sessions: 4,
          gymId,
          status: 'active',
          pricePerSession: 25000,
          commissionRate: 0.5,
          isActive: true,
          validityType: 'days',
          maxSessionsPerWeek: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      {}
    );

    console.log('[Seeder] ✅ Đã tạo 3 gói test PayOS thành công!');
    console.log('   - PayOS Test - Gói 1 Tháng (500k, 8 buổi)');
    console.log('   - PayOS Test - Gói 3 Tháng (1.5M, 20 buổi)');
    console.log('   - PayOS Test - Gói Rẻ (100k, 4 buổi)');
  },

  down: async (queryInterface, Sequelize) => {
    // Xóa các gói test PayOS
    await queryInterface.bulkDelete(
      'package',
      {
        name: {
          [Sequelize.Op.like]: '%PayOS Test%',
        },
      },
      {}
    );

    console.log('[Seeder] ✅ Đã xóa các gói test PayOS');
  },
};
