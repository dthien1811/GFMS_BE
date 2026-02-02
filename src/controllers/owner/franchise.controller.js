import ownerFranchiseService from "../../service/owner/franchise.service";

const ownerFranchiseController = {
  /**
   * POST /api/owner/franchise-requests
   * Tạo yêu cầu nhượng quyền mới
   */
  async createFranchiseRequest(req, res) {
    try {
      const userId = req.user.id;
      const data = req.body;

      const franchiseRequest = await ownerFranchiseService.createFranchiseRequest(userId, data);

      return res.status(201).json({
        message: "Tạo yêu cầu nhượng quyền thành công",
        data: franchiseRequest,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * GET /api/owner/franchise-requests
   * Lấy danh sách franchise requests của owner
   */
  async getMyFranchiseRequests(req, res) {
    try {
      const userId = req.user.id;
      const query = req.query;

      const result = await ownerFranchiseService.getMyFranchiseRequests(userId, query);

      return res.status(200).json({
        data: result.franchiseRequests,
        pagination: result.pagination,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * GET /api/owner/franchise-requests/:id
   * Lấy chi tiết một franchise request
   */
  async getMyFranchiseRequestDetail(req, res) {
    try {
      const userId = req.user.id;
      const requestId = req.params.id;

      const franchiseRequest = await ownerFranchiseService.getMyFranchiseRequestDetail(
        userId,
        requestId
      );

      return res.status(200).json({
        data: franchiseRequest,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * PUT /api/owner/franchise-requests/:id
   * Cập nhật franchise request (chỉ khi pending)
   */
  async updateMyFranchiseRequest(req, res) {
    try {
      const userId = req.user.id;
      const requestId = req.params.id;
      const data = req.body;

      const franchiseRequest = await ownerFranchiseService.updateMyFranchiseRequest(
        userId,
        requestId,
        data
      );

      return res.status(200).json({
        message: "Cập nhật yêu cầu nhượng quyền thành công",
        data: franchiseRequest,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * DELETE /api/owner/franchise-requests/:id
   * Xóa franchise request (chỉ khi pending)
   */
  async deleteMyFranchiseRequest(req, res) {
    try {
      const userId = req.user.id;
      const requestId = req.params.id;

      const result = await ownerFranchiseService.deleteMyFranchiseRequest(userId, requestId);

      return res.status(200).json(result);
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerFranchiseController;
