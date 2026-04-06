
const requestService = require("../../service/owner/request.service");

module.exports = {
  // Lấy danh sách yêu cầu
  async getRequests(req, res, next) {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const gymId = Number(req.query.gymId) || undefined;
      const result = await requestService.getRequests({ page, limit, gymId }); // Gọi service để lấy yêu cầu
      res.status(200).json({ data: result.data, pagination: result.pagination });
    } catch (error) {
      console.error("Error fetching requests:", error);  // Log chi tiết lỗi
      next(error);  // Đảm bảo tiếp tục xử lý lỗi
    }
  },

  // Duyệt yêu cầu
  async approveRequest(req, res, next) {       
    try {
      const request = await requestService.approveRequest(
        req.params.id,
        req.user.id,  // Lấy id từ req.user đã được xác thực
        req.body.approveNote
      );
      res.status(200).json({ message: "Request approved successfully", request });
    } catch (e) {
      next(e);  // Gọi middleware tiếp theo để xử lý lỗi
    }
  },

  // Từ chối yêu cầu
  async rejectRequest(req, res, next) {
    try {
      const request = await requestService.rejectRequest(
        req.params.id,
        req.user.id,  // Lấy id từ req.user đã được xác thực
        req.body.rejectNote
      );
      res.status(200).json({ message: "Request rejected successfully", request });
    } catch (e) {
      next(e);  // Gọi middleware tiếp theo để xử lý lỗi
    }
  },
};