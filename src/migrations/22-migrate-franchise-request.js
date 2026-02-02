'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('franchiserequest', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },

      // Request info
      requesterId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'user', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },

      businessName: { type: Sequelize.STRING(255), allowNull: false },
      location: { type: Sequelize.STRING(255), allowNull: false },

      contactPerson: { type: Sequelize.STRING(255), allowNull: false },
      contactPhone: { type: Sequelize.STRING(30), allowNull: true },
      contactEmail: { type: Sequelize.STRING(255), allowNull: true },

      investmentAmount: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
      businessPlan: { type: Sequelize.TEXT, allowNull: true },

      // Request status
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },

      // Review info
      reviewedBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'user', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      reviewNotes: { type: Sequelize.TEXT, allowNull: true },

      approvedAt: { type: Sequelize.DATE, allowNull: true },
      rejectedAt: { type: Sequelize.DATE, allowNull: true },
      rejectionReason: { type: Sequelize.TEXT, allowNull: true },

      // Contract flow (enterprise)
      contractStatus: {
        type: Sequelize.ENUM('not_sent', 'sent', 'viewed', 'signed', 'completed', 'void'),
        allowNull: false,
        defaultValue: 'not_sent',
      },

      // SignNow integration fields (support both mock + real)
      signProvider: {
        type: Sequelize.ENUM('mock', 'signnow'),
        allowNull: false,
        defaultValue: 'mock',
      },
      signNowDocumentId: { type: Sequelize.STRING(128), allowNull: true },
      signNowDocumentGroupId: { type: Sequelize.STRING(128), allowNull: true },
      signNowInviteId: { type: Sequelize.STRING(128), allowNull: true },
      contractUrl: { type: Sequelize.TEXT, allowNull: true },

      contractSigned: {
        // giữ để tương thích code cũ (nếu chỗ khác đang dùng)
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      contractSignedAt: { type: Sequelize.DATE, allowNull: true },
      contractCompletedAt: { type: Sequelize.DATE, allowNull: true },

      // Gym creation should happen ONLY after contractCompletedAt != null
      gymId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'gym', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      gymCreatedAt: { type: Sequelize.DATE, allowNull: true },

      // timestamps
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    // Indexes (tối ưu filter/list)
    await queryInterface.addIndex('franchiserequest', ['status']);
    await queryInterface.addIndex('franchiserequest', ['requesterId']);
    await queryInterface.addIndex('franchiserequest', ['reviewedBy']);
    await queryInterface.addIndex('franchiserequest', ['contractStatus']);
    await queryInterface.addIndex('franchiserequest', ['gymId']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('franchiserequest');

    // drop ENUM types safely (Sequelize/MySQL sẽ tự xử lý, nhưng để rõ ràng)
    // No-op in MySQL for ENUM removal outside dropTable.
  },
};
