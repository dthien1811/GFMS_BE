"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("member_metric", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },

      memberId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "member",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      heightCm: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },

      weightKg: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },

      bmi: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },

      status: {
        type: Sequelize.ENUM("underweight", "normal", "overweight", "obese"),
        allowNull: false,
      },

      note: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      recordedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("member_metric", ["memberId"], {
      name: "idx_member_metric_memberId",
    });

    await queryInterface.addIndex("member_metric", ["recordedAt"], {
      name: "idx_member_metric_recordedAt",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("member_metric", "idx_member_metric_recordedAt");
    await queryInterface.removeIndex("member_metric", "idx_member_metric_memberId");
    await queryInterface.dropTable("member_metric");
  },
};