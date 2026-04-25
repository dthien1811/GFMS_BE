'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class TrainerShare extends Model {
    static associate(models) {
      TrainerShare.belongsTo(models.Trainer, { foreignKey: 'trainerId' });
      TrainerShare.belongsTo(models.Gym, { foreignKey: 'fromGymId', as: 'fromGym' });
      TrainerShare.belongsTo(models.Gym, { foreignKey: 'toGymId', as: 'toGym' });
      TrainerShare.belongsTo(models.User, { foreignKey: 'requestedBy', as: 'requester' });
      TrainerShare.belongsTo(models.User, { foreignKey: 'approvedBy', as: 'approver' });
      TrainerShare.belongsTo(models.User, { foreignKey: 'acceptedBy', as: 'accepter' });
      TrainerShare.belongsTo(models.User, { foreignKey: 'rejectedBy', as: 'rejecter' });
      TrainerShare.belongsTo(models.Policy, { foreignKey: 'policyId' });
      TrainerShare.belongsTo(models.Member, { foreignKey: 'memberId' });
      if (models.Booking) {
        TrainerShare.hasMany(models.Booking, { foreignKey: "trainerShareId", as: "shareBookings" });
      }

      // ✅ NEW: overrides theo thời gian
      if (models.TrainerShareOverride) {
        TrainerShare.hasMany(models.TrainerShareOverride, {
          foreignKey: "trainerShareId",
          as: "overrides",
        });
      }
    }
  };
  TrainerShare.init({
    trainerId: DataTypes.INTEGER,
    fromGymId: DataTypes.INTEGER,
    toGymId: DataTypes.INTEGER,
    shareType: DataTypes.STRING,
    startDate: DataTypes.DATE,
    endDate: DataTypes.DATE,
    startTime: DataTypes.TIME,
    endTime: DataTypes.TIME,
    scheduleMode: DataTypes.STRING,
    specificSchedules: DataTypes.JSON,
    weekdaySchedules: DataTypes.JSON,
    commissionSplit: DataTypes.FLOAT,
    status: DataTypes.STRING, // open | pending_trainer (PT nhận lịch) | waiting_acceptance (legacy) | approved | rejected_by_partner; pending is legacy
    requestedBy: DataTypes.INTEGER,
    memberId: DataTypes.INTEGER, // Optional: hội viên gắn kèm để tham chiếu cho yêu cầu mượn PT
    approvedBy: DataTypes.INTEGER,
    acceptedBy: DataTypes.INTEGER,
    acceptedAt: DataTypes.DATE,
    rejectedBy: DataTypes.INTEGER,
    rejectedAt: DataTypes.DATE,
    notes: DataTypes.TEXT,
    policyId: DataTypes.INTEGER,
    /** Chuyên môn yêu cầu khi mượn mở (status open): chỉ PT khớp chuyên môn mới thấy / nhận lịch */
    borrowSpecialization: DataTypes.STRING,
    /** Giá một buổi (VND) — owner chi nhánh mượn (requestedBy) */
    sessionPrice: DataTypes.DECIMAL(12, 2),
    /** none | awaiting_transfer | paid */
    sharePaymentStatus: DataTypes.STRING,
    lenderBankName: DataTypes.STRING,
    lenderBankAccountNumber: DataTypes.STRING,
    lenderAccountHolderName: DataTypes.STRING,
    paymentInstructionSentAt: DataTypes.DATE,
    /** Bên mượn xác nhận đã chuyển */
    paymentMarkedPaidAt: DataTypes.DATE,
    /** PT khiếu nại chưa nhận tiền */
    sharePaymentDisputeNote: DataTypes.TEXT,
    sharePaymentDisputedAt: DataTypes.DATE,
    /** Owner chi nhánh mượn phản hồi khiếu nại + ảnh CK */
    borrowerDisputeResponseNote: DataTypes.TEXT,
    borrowerDisputeResponseAt: DataTypes.DATE,
    paymentProofImageUrls: DataTypes.JSON,
    /** Ghi chú khi owner xác nhận thanh toán cho bên cho mượn PT */
    paymentNote: DataTypes.TEXT,
    /** PT xác nhận đã nhận tiền / đồng ý phản hồi chủ phòng mượn */
    sharePaymentPtAcknowledgedAt: DataTypes.DATE,
    /** Liên kết đến yêu cầu báo bận gốc (BUSY_SLOT request) - khi owner chuyển sang luồng mượn PT */
    busySlotRequestId: DataTypes.INTEGER,
  }, {
    sequelize,
    modelName: 'TrainerShare',
    tableName: "trainershare"
  });
  return TrainerShare;
};
