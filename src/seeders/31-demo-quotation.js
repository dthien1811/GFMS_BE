'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Quotation', [
      {
        code: 'QUO-202401-001',
        supplierId: 1,
        gymId: 1,
        requestedBy: 2, // Assuming user ID 2 is gym owner
        validUntil: new Date('2024-02-28'),
        status: 'approved',
        totalAmount: 18500000,
        notes: 'Initial equipment purchase for new gym setup',
        createdAt: new Date('2024-01-05'),
        updatedAt: new Date('2024-01-05')
      },
      {
        code: 'QUO-202401-002',
        supplierId: 2,
        gymId: 1,
        requestedBy: 2,
        validUntil: new Date('2024-02-15'),
        status: 'pending',
        totalAmount: 7500000,
        notes: 'Additional accessories and small equipment',
        createdAt: new Date('2024-01-10'),
        updatedAt: new Date('2024-01-10')
      },
      {
        code: 'QUO-202401-003',
        supplierId: 3,
        gymId: 2,
        requestedBy: 2, // Same owner for gym 2
        validUntil: new Date('2024-02-20'),
        status: 'approved',
        totalAmount: 12000000,
        notes: 'Cardio equipment replacement',
        createdAt: new Date('2024-01-12'),
        updatedAt: new Date('2024-01-12')
      },
      {
        code: 'QUO-202402-001',
        supplierId: 1,
        gymId: 1,
        requestedBy: 2,
        validUntil: new Date('2024-03-10'),
        status: 'pending',
        totalAmount: 9500000,
        notes: 'Regular maintenance equipment order',
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-01')
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Quotation', null, {});
  }
};