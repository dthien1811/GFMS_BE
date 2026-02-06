'use strict';

module.exports = {
  up: async (queryInterface) => {
    // Ensure trainerId=1 belongs to gymId=2 for owner to see requests
    await queryInterface.sequelize.query(
      "UPDATE trainer SET gymId = 2 WHERE id = 1"
    );

    await queryInterface.bulkInsert(
      'withdrawal',
      [
        {
          trainerId: 1,
          amount: 1500000,
          withdrawalMethod: 'bank_transfer',
          accountInfo: JSON.stringify({
            bankName: 'Vietcombank',
            accountNumber: '1234567890',
            accountHolder: 'Trainer John',
          }),
          status: 'pending',
          processedBy: null,
          processedDate: null,
          notes: 'Rút tiền tháng 03',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          trainerId: 1,
          amount: 900000,
          withdrawalMethod: 'bank_transfer',
          accountInfo: JSON.stringify({
            bankName: 'ACB',
            accountNumber: '9876543210',
            accountHolder: 'Trainer John',
          }),
          status: 'completed',
          processedBy: 1,
          processedDate: new Date('2024-03-10'),
          notes: 'Đã duyệt',
          createdAt: new Date('2024-03-01'),
          updatedAt: new Date('2024-03-10'),
        },
        {
          trainerId: 1,
          amount: 500000,
          withdrawalMethod: 'bank_transfer',
          accountInfo: JSON.stringify({
            bankName: 'Techcombank',
            accountNumber: '555666777',
            accountHolder: 'Trainer John',
          }),
          status: 'rejected',
          processedBy: 1,
          processedDate: new Date('2024-03-05'),
          notes: 'Sai thông tin tài khoản',
          createdAt: new Date('2024-02-25'),
          updatedAt: new Date('2024-03-05'),
        },
        {
          trainerId: 1,
          amount: 1200000,
          withdrawalMethod: 'bank_transfer',
          accountInfo: JSON.stringify({
            bankName: 'MB Bank',
            accountNumber: '1122334455',
            accountHolder: 'Trainer John',
          }),
          status: 'pending',
          processedBy: null,
          processedDate: null,
          notes: 'Rút tiền tuần 1',
          createdAt: new Date('2024-03-12'),
          updatedAt: new Date('2024-03-12'),
        },
        {
          trainerId: 1,
          amount: 750000,
          withdrawalMethod: 'bank_transfer',
          accountInfo: JSON.stringify({
            bankName: 'VietinBank',
            accountNumber: '2233445566',
            accountHolder: 'Trainer John',
          }),
          status: 'completed',
          processedBy: 1,
          processedDate: new Date('2024-03-15'),
          notes: 'Đã duyệt nhanh',
          createdAt: new Date('2024-03-13'),
          updatedAt: new Date('2024-03-15'),
        },
        {
          trainerId: 1,
          amount: 300000,
          withdrawalMethod: 'bank_transfer',
          accountInfo: JSON.stringify({
            bankName: 'BIDV',
            accountNumber: '9988776655',
            accountHolder: 'Trainer John',
          }),
          status: 'rejected',
          processedBy: 1,
          processedDate: new Date('2024-03-14'),
          notes: 'Số tiền không hợp lệ',
          createdAt: new Date('2024-03-14'),
          updatedAt: new Date('2024-03-14'),
        },
      ],
      {}
    );
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('withdrawal', null, {});
  },
};
