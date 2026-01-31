"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    const pendingRequests = [
      {
        requesterId: 2,
        businessName: "Franchise Request Sai Gon Fit",
        location: "Ho Chi Minh City",
        contactPerson: "Nguyen Van A",
        contactPhone: "0909111111",
        contactEmail: "owner_sg1@gfms.com",
        investmentAmount: 350000000,
        businessPlan: "Open mid-size gym in district 7",
        status: "pending",
        contractStatus: "not_sent",
        createdAt: now,
        updatedAt: now,
      },
      {
        requesterId: 3,
        businessName: "Franchise Request Da Nang Plus",
        location: "Da Nang",
        contactPerson: "Tran Thi B",
        contactPhone: "0909222222",
        contactEmail: "owner_dn1@gfms.com",
        investmentAmount: 420000000,
        businessPlan: "Premium gym near beach area",
        status: "pending",
        contractStatus: "not_sent",
        createdAt: now,
        updatedAt: now,
      },
      {
        requesterId: 4,
        businessName: "Franchise Request Can Tho",
        location: "Can Tho",
        contactPerson: "Le Van C",
        contactPhone: "0909333333",
        contactEmail: "owner_ct@gfms.com",
        investmentAmount: 280000000,
        businessPlan: "Local gym for students and workers",
        status: "pending",
        contractStatus: "not_sent",
        createdAt: now,
        updatedAt: now,
      },
      {
        requesterId: 5,
        businessName: "Franchise Request Hai Phong",
        location: "Hai Phong",
        contactPerson: "Pham Thi D",
        contactPhone: "0909444444",
        contactEmail: "owner_hp@gfms.com",
        investmentAmount: 500000000,
        businessPlan: "Large gym with PT sharing model",
        status: "pending",
        contractStatus: "not_sent",
        createdAt: now,
        updatedAt: now,
      },
      {
        requesterId: 6,
        businessName: "Franchise Request Binh Duong",
        location: "Binh Duong",
        contactPerson: "Vo Van E",
        contactPhone: "0909555555",
        contactEmail: "owner_bd@gfms.com",
        investmentAmount: 320000000,
        businessPlan: "Industrial zone gym for workers",
        status: "pending",
        contractStatus: "not_sent",
        createdAt: now,
        updatedAt: now,
      },
    ];

    await queryInterface.bulkInsert("franchiserequest", pendingRequests);
  },

  async down(queryInterface, Sequelize) {
    // ❌ Không rollback để tránh mất dữ liệu demo khác
    // Nếu cần xóa riêng nhóm này thì lọc theo businessName
    // await queryInterface.bulkDelete("franchiserequest", {
    //   businessName: { [Sequelize.Op.like]: "Franchise Request %" },
    // });
  },
};
