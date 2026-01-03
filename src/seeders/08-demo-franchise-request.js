'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('FranchiseRequest', [ // SỐ ÍT
      {
        requesterId: 2,
        businessName: 'FitLife Gym Da Nang',
        location: '123 Beach Street, Da Nang',
        contactPerson: 'John Owner',
        contactPhone: '0901234568',
        contactEmail: 'owner1@gfms.com',
        investmentAmount: 500000000,
        businessPlan: 'Opening a premium gym with modern equipment...',
        status: 'approved',
        reviewedBy: 1,
        reviewNotes: 'Business plan looks solid. Approved.',
        approvedDate: new Date(),
        contractSigned: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('FranchiseRequest', null, {}); // SỐ ÍT
  }
};