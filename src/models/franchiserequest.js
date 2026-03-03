"use strict";

module.exports = (sequelize, DataTypes) => {
  const FranchiseRequest = sequelize.define(
    "FranchiseRequest",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      requesterId: { type: DataTypes.INTEGER, allowNull: false },

      businessName: { type: DataTypes.STRING, allowNull: false },
      location: { type: DataTypes.STRING, allowNull: true },

      contactPerson: { type: DataTypes.STRING, allowNull: true },
      contactPhone: { type: DataTypes.STRING, allowNull: true },
      contactEmail: { type: DataTypes.STRING, allowNull: true },

      investmentAmount: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
      businessPlan: { type: DataTypes.TEXT, allowNull: true },

      status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "pending",
      },

      reviewedBy: { type: DataTypes.INTEGER, allowNull: true },
      reviewNotes: { type: DataTypes.TEXT, allowNull: true },
      approvedAt: { type: DataTypes.DATE, allowNull: true },
      rejectedAt: { type: DataTypes.DATE, allowNull: true },
      rejectionReason: { type: DataTypes.TEXT, allowNull: true },

      // ===== CONTRACT / SIGN FLOW =====
      contractStatus: {
        type: DataTypes.ENUM("not_sent", "sent", "viewed", "signed", "completed", "void"),
        allowNull: false,
        defaultValue: "not_sent",
      },

      signProvider: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "mock",
      },

      // signNow fields (optional - demo enterprise)
      signNowDocumentId: { type: DataTypes.STRING, allowNull: true },
      signNowDocumentGroupId: { type: DataTypes.STRING, allowNull: true },
      signNowInviteId: { type: DataTypes.STRING, allowNull: true },

      contractUrl: { type: DataTypes.TEXT, allowNull: true },

      contractSigned: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
      contractSignedAt: { type: DataTypes.DATE, allowNull: true },
      contractCompletedAt: { type: DataTypes.DATE, allowNull: true },

      // gym created after countersign
      gymId: { type: DataTypes.INTEGER, allowNull: true },
      gymCreatedAt: { type: DataTypes.DATE, allowNull: true },

      // ===== SECURE TOKEN (only store hash) =====
      ownerSignTokenHash: { type: DataTypes.STRING, allowNull: true },
      ownerSignTokenExpiresAt: { type: DataTypes.DATE, allowNull: true },
      ownerSignTokenUsedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "franchiserequest",
      freezeTableName: true,
      timestamps: true,
    }
  );

  FranchiseRequest.associate = (models) => {
    if (models.User) {
      FranchiseRequest.belongsTo(models.User, { foreignKey: "requesterId", as: "requester" });
      FranchiseRequest.belongsTo(models.User, { foreignKey: "reviewedBy", as: "reviewer" });
    }
    if (models.Gym) {
      FranchiseRequest.belongsTo(models.Gym, { foreignKey: "gymId", as: "gym" });
    }

    if (models.FranchiseContractDocument) {
      FranchiseRequest.hasMany(models.FranchiseContractDocument, {
        foreignKey: "franchiseRequestId",
        as: "contractDocuments",
      });
    }
    if (models.FranchiseContractAudit) {
      FranchiseRequest.hasMany(models.FranchiseContractAudit, {
        foreignKey: "franchiseRequestId",
        as: "contractAudits",
      });
    }

  };

  return FranchiseRequest;
};
