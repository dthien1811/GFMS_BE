import ownerWithdrawalService from "../../service/owner/withdrawal.service";
import { emitToTrainer, emitToUser } from "../../socket";

const ownerWithdrawalController = {
  async getWithdrawals(req, res) {
    try {
      const userId = req.user.id;
      const result = await ownerWithdrawalService.getWithdrawals(userId, req.query);
      return res.status(200).json({
        data: result.data,
        pagination: result.pagination,
      });
    } catch (e) {
      console.error("Error in getWithdrawals controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async approveWithdrawal(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const result = await ownerWithdrawalService.approveWithdrawal(userId, id);
      const trainerId = result?.Trainer?.id;
      emitToTrainer(trainerId, "withdrawal:approved", { id: result.id, status: result.status });
      emitToUser(userId, "withdrawal:approved", { id: result.id, status: result.status });
      return res.status(200).json({ data: result, message: "Đã duyệt chi trả" });
    } catch (e) {
      console.error("Error in approveWithdrawal controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async exportWithdrawals(req, res) {
    try {
      const userId = req.user.id;
      const result = await ownerWithdrawalService.exportWithdrawals(userId, req.query);
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      return res.status(200).send(result.buffer);
    } catch (e) {
      console.error("Error in exportWithdrawals controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async rejectWithdrawal(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { reason } = req.body || {};
      const result = await ownerWithdrawalService.rejectWithdrawal(userId, id, reason);
      const trainerId = result?.Trainer?.id;
      emitToTrainer(trainerId, "withdrawal:rejected", { id: result.id, status: result.status });
      emitToUser(userId, "withdrawal:rejected", { id: result.id, status: result.status });
      return res.status(200).json({ data: result, message: "Đã từ chối yêu cầu" });
    } catch (e) {
      console.error("Error in rejectWithdrawal controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerWithdrawalController;
