'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Supplier', [
      {
        name: 'Fitness Equipment Vietnam',
        code: 'FEV-001',
        contactPerson: 'Mr. Nguyen Van A',
        email: 'contact@fitnessvn.com',
        phone: '0901234001',
        address: '123 Nguyen Van Linh, District 7, HCMC',
        taxCode: '0312345678',
        status: 'active',
        notes: 'Main supplier for gym equipment',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Sports Gear Co., Ltd',
        code: 'SGC-002',
        contactPerson: 'Ms. Tran Thi B',
        email: 'sales@sportsgear.vn',
        phone: '0901234002',
        address: '456 Le Van Sy, Tan Binh District, HCMC',
        taxCode: '0312345679',
        status: 'active',
        notes: 'Supplier for sports accessories',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Health & Wellness Equipment',
        code: 'HWE-003',
        contactPerson: 'Mr. Le Van C',
        email: 'info@healthwellness.vn',
        phone: '0901234003',
        address: '789 Truong Chinh, District 12, HCMC',
        taxCode: '0312345680',
        status: 'active',
        notes: 'Specialized in cardio equipment',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Gym Essentials Vietnam',
        code: 'GEV-004',
        contactPerson: 'Mr. Pham Van D',
        email: 'info@gymessentials.vn',
        phone: '0901234004',
        address: '321 Cach Mang Thang 8, District 3, HCMC',
        taxCode: '0312345681',
        status: 'active',
        notes: 'Supplier for gym accessories and supplements',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Supplier', null, {});
  }
};