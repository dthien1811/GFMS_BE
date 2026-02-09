"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const now = new Date();

    // 1) Lấy danh sách gymId đang tồn tại
    const [gyms] = await queryInterface.sequelize.query(
      "SELECT id FROM gym ORDER BY id ASC"
    );

    // 2) Lấy danh sách equipmentId đang tồn tại
    const [equipments] = await queryInterface.sequelize.query(
      "SELECT id FROM equipment ORDER BY id ASC"
    );

    if (!gyms.length) throw new Error("❌ Không có record nào trong bảng gym. Hãy seed gym trước.");
    if (!equipments.length) throw new Error("❌ Không có record nào trong bảng equipment. Hãy seed equipment trước.");

    // 3) Lấy 1 userId hợp lệ để requestedBy (ưu tiên id nhỏ nhất)
    const [users] = await queryInterface.sequelize.query(
      "SELECT id FROM user ORDER BY id ASC"
    );
    if (!users.length) throw new Error("❌ Không có record nào trong bảng user. Hãy seed user trước.");

    const gymIds = gyms.map((g) => g.id);
    const equipmentIds = equipments.map((e) => e.id);
    const requestedById = users[0].id;

    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const priorities = ["low", "medium", "high"];

    // 4) Tạo 20 pending records
    const data = Array.from({ length: 20 }).map((_, i) => ({
      equipmentId: pick(equipmentIds),
      gymId: pick(gymIds),
      issueDescription: `Seed pending maintenance #${i + 1} - auto generated`,
      priority: priorities[i % 3],
      requestedBy: requestedById,
      assignedTo: null,
      estimatedCost: 500000 + (i + 1) * 50000,
      actualCost: null,
      status: "pending",
      scheduledDate: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
      completionDate: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    }));

    await queryInterface.bulkInsert("maintenance", data, {});
    console.log("✅ Seeded 20 pending maintenance records successfully");
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete("maintenance", { status: "pending" }, {});
  },
};
