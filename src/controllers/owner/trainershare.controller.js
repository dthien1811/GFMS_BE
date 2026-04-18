import ownerTrainerShareService from "../../service/owner/trainershare.service";

const ownerTrainerShareController = {
  /**
   * POST /api/owner/trainer-shares
   * Tạo yêu cầu chia sẻ trainer
   */
  async createTrainerShare(req, res) {
    try {
      const userId = req.user.id;
      const data = req.body;

      const trainerShare = await ownerTrainerShareService.createTrainerShare(userId, data);

      return res.status(201).json({
        message: "Tạo yêu cầu chia sẻ trainer thành công",
        data: trainerShare,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * GET /api/owner/trainer-shares
   * Lấy danh sách trainer shares của owner
   */
  async getMyTrainerShares(req, res) {
    try {
      const userId = req.user.id;
      const query = req.query;

      const result = await ownerTrainerShareService.getMyTrainerShares(userId, query);

      return res.status(200).json({
        data: result.trainerShares,
        pagination: result.pagination,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * GET /api/owner/trainer-shares/:id
   * Lấy chi tiết một trainer share
   */
  async getMyTrainerShareDetail(req, res) {
    try {
      const userId = req.user.id;
      const shareId = req.params.id;

      const trainerShare = await ownerTrainerShareService.getMyTrainerShareDetail(userId, shareId);

      return res.status(200).json({
        data: trainerShare,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * PUT /api/owner/trainer-shares/:id
    * Cập nhật trainer share (chỉ khi waiting_acceptance)
   */
  async updateMyTrainerShare(req, res) {
    try {
      const userId = req.user.id;
      const shareId = req.params.id;
      const data = req.body;

      const trainerShare = await ownerTrainerShareService.updateMyTrainerShare(
        userId,
        shareId,
        data
      );

      return res.status(200).json({
        message: "Cập nhật yêu cầu chia sẻ trainer thành công",
        data: trainerShare,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * DELETE /api/owner/trainer-shares/:id
    * Xóa trainer share (chỉ khi waiting_acceptance)
   */
  async deleteMyTrainerShare(req, res) {
    try {
      const userId = req.user.id;
      const shareId = req.params.id;

      const result = await ownerTrainerShareService.deleteMyTrainerShare(userId, shareId);

      return res.status(200).json(result);
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * GET /api/owner/trainer-shares/available-trainers/:gymId
   * Lấy danh sách trainers có sẵn cho gym
   */
  async getAvailableTrainers(req, res) {
    try {
      const userId = req.user.id;
      const gymId = req.params.gymId;
      const options = { includeBorrowed: req.query.includeBorrowed };

      const result = await ownerTrainerShareService.getAvailableTrainers(userId, gymId, options);

      return res.status(200).json(result);
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * GET /api/owner/trainer-shares/received
   * Lấy danh sách yêu cầu chia sẻ trainer nhận được (toGym thuộc owner)
   */
  async getReceivedRequests(req, res) {
    try {
      const userId = req.user.id;
      const query = req.query;

      const result = await ownerTrainerShareService.getReceivedTrainerShareRequests(userId, query);

      return res.status(200).json(result);
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * POST /api/owner/trainer-shares/:id/accept
   * Owner B chấp nhận yêu cầu chia sẻ trainer
   */
  async acceptRequest(req, res) {
    try {
      const userId = req.user.id;
      const requestId = req.params.id;

      const result = await ownerTrainerShareService.acceptTrainerShareRequest(userId, requestId);

      return res.status(200).json({
        message: "Đã chấp nhận yêu cầu chia sẻ trainer",
        data: result,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * POST /api/owner/trainer-shares/:id/reject
   * Owner B từ chối yêu cầu chia sẻ trainer
   */
  async rejectRequest(req, res) {
    try {
      const userId = req.user.id;
      const requestId = req.params.id;
      const { reason } = req.body;

      const result = await ownerTrainerShareService.rejectTrainerShareRequest(userId, requestId, reason);

      return res.status(200).json({
        message: "Đã từ chối yêu cầu chia sẻ trainer",
        data: result,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /** PUT /api/owner/trainer-shares/:id/session-price — owner mượn nhập giá buổi (phiếu đã approved) */
  async updateSessionPrice(req, res) {
    try {
      const userId = req.user.id;
      const shareId = req.params.id;
      const data = await ownerTrainerShareService.updateBorrowerSessionPrice(userId, shareId, req.body);
      return res.status(200).json({
        message: "Đã cập nhật giá buổi",
        data,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /** POST /api/owner/trainer-shares/:id/payment-confirm — owner mượn xác nhận đã chuyển */
  async confirmPayment(req, res) {
    try {
      const userId = req.user.id;
      const shareId = req.params.id;
      const data = await ownerTrainerShareService.confirmBorrowerSharePayment(
        userId,
        shareId,
        req.body || {},
      );
      return res.status(200).json({
        message: "Đã xác nhận thanh toán",
        data,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /** POST /api/owner/trainer-shares/:id/payment-dispute-response — phản hồi khiếu nại + URL ảnh CK */
  async respondPaymentDispute(req, res) {
    try {
      const userId = req.user.id;
      const shareId = req.params.id;
      const data = await ownerTrainerShareService.respondBorrowerSharePaymentDispute(
        userId,
        shareId,
        req.body || {},
      );
      return res.status(200).json({
        message: "Đã gửi phản hồi",
        data,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerTrainerShareController;
