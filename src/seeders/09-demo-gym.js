'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Kiểm tra schema để tránh lỗi khi cột chưa được migrate
    let includeOperatingHours = false;
    let includeImages = false;
    try {
      const tableDesc = await queryInterface.describeTable('Gym');
      includeOperatingHours = !!tableDesc.operatingHours;
      includeImages = !!tableDesc.images;
    } catch (err) {
      // Nếu bảng chưa tồn tại (migration chưa chạy) thì bỏ qua các trường tùy chọn
      console.warn('describeTable failed for Gym, skipping optional fields:', err && err.message ? err.message : err);
    }

    // Đảm bảo đã có user trước (ownerId phải tồn tại trong bảng User)
    const now = new Date();
    const gyms = [
      {
        name: 'The Fit Club HCM - Quận 1',
        address: '12 Nguyễn Huệ, Q.1, TP.HCM',
        phone: '0987 654 321',
        email: 'q1.hcm@gfms-demo.com',
        description: 'Gym cao cấp trung tâm, đầy đủ máy móc, khu functional training và khu free-weight.',
        status: 'active',
        ownerId: 1,               // phải trùng với user đã seed
        franchiseRequestId: null,
        createdAt: now,
        updatedAt: now
      },
      {
        name: 'The Fit Club HCM - Thủ Đức',
        address: '50 Võ Văn Ngân, TP. Thủ Đức, TP.HCM',
        phone: '0909 111 222',
        email: 'td.hcm@gfms-demo.com',
        description: 'Chi nhánh hướng tới sinh viên, giá tốt, có khu crossfit và studio group-X.',
        status: 'active',
        ownerId: 1,
        franchiseRequestId: null,
        createdAt: now,
        updatedAt: now
      },
      {
        name: 'The Fit Club Hà Nội - Ba Đình',
        address: '25 Kim Mã, Ba Đình, Hà Nội',
        phone: '0912 345 678',
        email: 'bd.hn@gfms-demo.com',
        description: 'Gym full dịch vụ: PT cá nhân, phòng xông hơi, phòng yoga & pilates.',
        status: 'active',
        ownerId: 2,
        franchiseRequestId: null,
        createdAt: now,
        updatedAt: now
      }
    ];

    gyms.forEach(g => {
      if (includeOperatingHours) {
        // format trùng với FE (monFri/weekend)
        g.operatingHours = JSON.stringify({
          monFri: { open: '06:00', close: '22:00' },
          weekend: { open: '08:00', close: '20:00' }
        });
      }
      if (includeImages) {
        // dùng trực tiếp link hình ảnh (Google Images / CDN)
        g.images = JSON.stringify([
          'https://images.pexels.com/photos/1954524/pexels-photo-1954524.jpeg',
          'https://images.pexels.com/photos/1552249/pexels-photo-1552249.jpeg',
          'https://images.pexels.com/photos/1552104/pexels-photo-1552104.jpeg'
        ]);
      }
    });

    return queryInterface.bulkInsert('Gym', gyms, {});
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('Gym', null, {});
  }
};