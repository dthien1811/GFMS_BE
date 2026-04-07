import ownerTrainerShareService from "../../service/owner/trainershare.service";

const trainerShareRequestController = {
  async listAvailable(req, res) {
    try {
      const userId = req.user.id;
      const result = await ownerTrainerShareService.listAvailableTrainerShareRequestsForTrainer(
        userId,
        req.query || {}
      );
      return res.status(200).json(result);
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async claim(req, res) {
    try {
      const userId = req.user.id;
      const requestId = req.params.id;
      const result = await ownerTrainerShareService.claimTrainerShareRequest(userId, requestId);
      return res.status(200).json({
        message: "Bạn đã nhận slot thành công",
        data: result,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default trainerShareRequestController;
