module.exports = (sequelize, DataTypes) => {
  const FranchiseRequest = sequelize.define(
    "FranchiseRequest",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      requesterId: { type: DataTypes.INTEGER, allowNull: false },

      businessName: DataTypes.STRING,
      location: DataTypes.STRING,
      contactPerson: DataTypes.STRING,
      contactPhone: DataTypes.STRING,
      contactEmail: DataTypes.STRING,
      investmentAmount: DataTypes.DECIMAL(15, 2),
      businessPlan: DataTypes.TEXT,

      // BUSINESS STATUS
      status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        defaultValue: "pending",
      },

      reviewedBy: DataTypes.INTEGER,
      reviewNotes: DataTypes.TEXT,
      approvedAt: DataTypes.DATE,
      rejectedAt: DataTypes.DATE,
      rejectionReason: DataTypes.TEXT,

      // CONTRACT FLOW
      contractStatus: {
        type: DataTypes.ENUM("not_sent", "sent", "signed", "completed"),
        defaultValue: "not_sent",
      },

      signProvider: DataTypes.STRING,
      signNowDocumentId: DataTypes.STRING,
      signNowInviteId: DataTypes.STRING,
      contractUrl: DataTypes.TEXT,

      contractSigned: { type: DataTypes.BOOLEAN, defaultValue: false },
      contractSignedAt: DataTypes.DATE,
      contractCompletedAt: DataTypes.DATE,

      // RESULT
      gymId: DataTypes.INTEGER,
      gymCreatedAt: DataTypes.DATE,
    },
    {
      tableName: "franchiserequest",
      timestamps: true,
    }
  );

  /**
   * ✅ FIX: khai báo association để Sequelize hiểu "requester" và "reviewer"
   * Lưu ý: alias PHẢI trùng với as trong include ở service:
   * as: "requester" và as: "reviewer"
   */
  FranchiseRequest.associate = (models) => {
    // Người tạo request
    FranchiseRequest.belongsTo(models.User, {
      as: "requester",
      foreignKey: "requesterId",
    });

    // Người duyệt (admin)
    FranchiseRequest.belongsTo(models.User, {
      as: "reviewer",
      foreignKey: "reviewedBy",
    });

    // Nếu bạn có model Gym và muốn include gym:
    // FranchiseRequest.belongsTo(models.Gym, { as: "gym", foreignKey: "gymId" });
  };

  return FranchiseRequest;
};
