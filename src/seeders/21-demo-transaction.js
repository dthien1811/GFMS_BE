'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Transaction', [ // SỐ ÍT
      {
        transactionCode: 'TRX202400001',
        memberId: 1,
        trainerId: null,
        gymId: 1,
        packageId: 1,
        amount: 10000000,
        transactionType: 'package_purchase',
        paymentMethod: 'credit_card',
        paymentStatus: 'completed',
        description: 'Purchase Premium 3 Months Package',
        metadata: JSON.stringify({ gateway: 'VNPAY', fee: 10000 }),
        transactionDate: new Date('2024-01-20 14:30:00'),
        packageActivationId: 1,
        processedBy: 2,
        commissionAmount: 0,
        ownerAmount: 10000000,
        platformFee: 500000,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Transaction', null, {}); // SỐ ÍT
  }
};