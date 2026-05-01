// src/controllers/member/myPackages.controller.js
import memberMyPackageService from "../../service/member/myPackages.service";

const memberMyPackageController = {
  async getMyPackages(req, res) {
    try {
      const data = await memberMyPackageService.getMyPackages(req.user.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getMyPackageDetail(req, res) {
    try {
      const data = await memberMyPackageService.getMyPackageDetail(
        req.user.id,
        req.params.activationId
      );
      return res.status(200).json({ DT: data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  // (OPTIONAL) nếu bạn vẫn muốn endpoint này (admin/flow cũ)
  // ✅ Assign trainer sẽ update Transaction.trainerId (không update activation)
  async assignTrainer(req, res) {
    try {
      const data = await memberMyPackageService.assignTrainer(
        req.user.id,
        req.params.activationId,
        req.body?.trainerId
      );
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  // ✅ Auto book theo pattern 4/8/12 tuần
  async saveWeekPatternAndAutoBook(req, res) {
    try {
      const data = await memberMyPackageService.saveWeekPatternAndAutoBook(
        req.user.id,
        req.params.activationId,
        req.body
      );
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async retryPendingPayment(req, res) {
    try {
      const data = await memberMyPackageService.retryPendingPayment(
        req.user.id,
        req.params.transactionId
      );
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default memberMyPackageController;