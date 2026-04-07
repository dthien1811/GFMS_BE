
const { Request, User } = require("../../models");
const realtimeService = require("../realtime.service").default;
const { Sequelize } = require('sequelize');

const prettyType = (t) => {
  const key = String(t || "").toLowerCase();
  if (key === "leave") return "nghỉ phép";
  if (key === "overtime") return "tăng ca";
  if (key === "shift_change") return "đổi ca";
  if (key === "transfer_branch") return "chuyển cơ sở";
  return key || "yêu cầu";
};

module.exports = {
  async getRequests() {
    try {
      const requests = await Request.findAll({
          where: {
          status: {
            [Sequelize.Op.ne]: 'cancelled',  // Lọc bỏ những yêu cầu có trạng thái 'cancelled'
          }
        },
        include: [
          {
            model: User,
            as: 'requester',
            attributes: ['id', 'username'],  // Lấy cột 'username' của người gửi
          },
          {
            model: User,
            as: 'approver',
            attributes: ['id', 'username'],  // Lấy cột 'username' của người duyệt
          }
        ]
      });

      return requests.map(request => ({
        id: request.id,
        requestType: request.requestType,
        status: request.status,
        reason: request.reason,
        requesterUsername: request.requester ? request.requester.username : null,  // Tên người gửi (username)
        approverUsername: request.approver ? request.approver.username : null,  // Tên người duyệt (username)
      }));
    } catch (error) {
      console.error("Error fetching requests:", error);
      throw new Error('Error fetching requests: ' + error.message);
    }
  },

  async approveRequest(requestId, approverId, approveNote) {
    const request = await Request.findByPk(requestId);
    if (!request) throw new Error('Request not found');

    request.status = 'approved';
    request.approverId = approverId;
    request.approveNote = approveNote || '';
    request.processedAt = new Date();

    await request.save();
    try {
      await realtimeService.notifyUser(request.requesterId, {
        title: "Yêu cầu đã được duyệt",
        message: `Yêu cầu ${prettyType(request.requestType)} của bạn đã được duyệt.`,
        notificationType: "request_update",
        relatedType: "request",
        relatedId: request.id,
      });
    } catch (e) {
      console.error("[owner/request.service] notify approve error:", e?.message || e);
    }
    return request;
  },

  async rejectRequest(requestId, approverId, rejectNote) {
    const request = await Request.findByPk(requestId);
    if (!request) throw new Error('Request not found');

    request.status = 'rejected';
    request.approverId = approverId;
    request.approveNote = rejectNote || '';
    request.processedAt = new Date();

    await request.save();
    try {
      const reasonText = String(rejectNote || "").trim();
      const detail = reasonText ? ` Lý do: ${reasonText}` : "";
      await realtimeService.notifyUser(request.requesterId, {
        title: "Yêu cầu bị từ chối",
        message: `Yêu cầu ${prettyType(request.requestType)} của bạn đã bị từ chối.${detail}`,
        notificationType: "request_update",
        relatedType: "request",
        relatedId: request.id,
      });
    } catch (e) {
      console.error("[owner/request.service] notify reject error:", e?.message || e);
    }
    return request;
  },
};