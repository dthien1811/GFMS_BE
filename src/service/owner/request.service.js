
const { Request, User } = require("../../models");
const { Sequelize } = require('sequelize');

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
    return request;
  },
};