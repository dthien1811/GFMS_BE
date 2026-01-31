'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const now = new Date();

    await queryInterface.bulkInsert('franchiserequest', [
      // 1) Pending – chờ admin duyệt
      {
        requesterId: 2,
        businessName: 'Franchise Request Pending',
        location: 'Ho Chi Minh City',
        contactPerson: 'Owner Pending',
        contactPhone: '0901000001',
        contactEmail: 'owner_pending@gfms.com',
        investmentAmount: 300000000,
        businessPlan: 'Initial franchise proposal',
        status: 'pending',

        reviewedBy: null,
        reviewNotes: null,
        approvedAt: null,
        rejectedAt: null,
        rejectionReason: null,

        // contract flow
        contractStatus: 'not_sent',
        signProvider: 'mock',
        signNowDocumentId: null,
        signNowDocumentGroupId: null,
        signNowInviteId: null,
        contractUrl: null,

        contractSigned: false,
        contractSignedAt: null,
        contractCompletedAt: null,

        gymId: null,
        gymCreatedAt: null,

        createdAt: now,
        updatedAt: now,
      },

      // 2) Approved – ĐÃ DUYỆT nhưng CHƯA ký hợp đồng
      {
        requesterId: 3,
        businessName: 'Franchise Request Approved',
        location: 'Da Nang',
        contactPerson: 'Owner Approved',
        contactPhone: '0901000002',
        contactEmail: 'owner_approved@gfms.com',
        investmentAmount: 500000000,
        businessPlan: 'Approved but waiting for contract signing',
        status: 'approved',

        reviewedBy: 1,
        reviewNotes: 'Approved. Please proceed to contract signing.',
        approvedAt: now,
        rejectedAt: null,
        rejectionReason: null,

        contractStatus: 'not_sent',
        signProvider: 'mock',
        signNowDocumentId: null,
        signNowDocumentGroupId: null,
        signNowInviteId: null,
        contractUrl: null,

        contractSigned: false,
        contractSignedAt: null,
        contractCompletedAt: null,

        gymId: null,
        gymCreatedAt: null,

        createdAt: now,
        updatedAt: now,
      },

      // 3) Rejected – bị từ chối
      {
        requesterId: 4,
        businessName: 'Franchise Request Rejected',
        location: 'Ha Noi',
        contactPerson: 'Owner Rejected',
        contactPhone: '0901000003',
        contactEmail: 'owner_rejected@gfms.com',
        investmentAmount: 200000000,
        businessPlan: 'Insufficient investment',
        status: 'rejected',

        reviewedBy: 1,
        reviewNotes: 'Investment capacity not sufficient.',
        approvedAt: null,
        rejectedAt: now,
        rejectionReason: 'Investment capacity not sufficient.',

        contractStatus: 'not_sent',
        signProvider: 'mock',
        signNowDocumentId: null,
        signNowDocumentGroupId: null,
        signNowInviteId: null,
        contractUrl: null,

        contractSigned: false,
        contractSignedAt: null,
        contractCompletedAt: null,

        gymId: null,
        gymCreatedAt: null,

        createdAt: now,
        updatedAt: now,
      },
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete(
      'franchiserequest',
      {
        businessName: {
          [Sequelize.Op.like]: 'Franchise Request%',
        },
      },
      {}
    );
  },
};
