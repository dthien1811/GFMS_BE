'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('refreshTokenSession', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'user', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      sessionId: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      familyId: { type: Sequelize.STRING(64), allowNull: false },
      tokenHash: { type: Sequelize.STRING(128), allowNull: false },
      replacedByTokenHash: { type: Sequelize.STRING(128), allowNull: true },
      revokedAt: { type: Sequelize.DATE, allowNull: true },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      rememberMe: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      lastUsedAt: { type: Sequelize.DATE, allowNull: true },
      createdByIp: { type: Sequelize.STRING(64), allowNull: true },
      userAgent: { type: Sequelize.STRING(512), allowNull: true },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.addIndex('refreshTokenSession', ['userId']);
    await queryInterface.addIndex('refreshTokenSession', ['familyId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('refreshTokenSession');
  },
};
