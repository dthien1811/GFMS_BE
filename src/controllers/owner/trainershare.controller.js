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
   * Cập nhật trainer share (chỉ khi pending)
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
   * Xóa trainer share (chỉ khi pending)
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

      const trainers = await ownerTrainerShareService.getAvailableTrainers(userId, gymId);

      return res.status(200).json({ trainers });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerTrainerShareController;
