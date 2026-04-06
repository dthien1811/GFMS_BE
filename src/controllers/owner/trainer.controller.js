import ownerTrainerService from "../../service/owner/trainer.service";

const ownerTrainerController = {
  async getMyTrainers(req, res) {
    try {
      const userId = req.user.id;
      const query = req.query;
      const result = await ownerTrainerService.getMyTrainers(userId, query);
      return res.status(200).json({
        data: result.trainers,
        pagination: result.pagination,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getUsersWithoutPTRole(req, res) {
    try {
      const userId = req.user.id;
      const query = req.query;
      const result = await ownerTrainerService.getUsersWithoutPTRole(userId, query);
      console.log("Returning users:", result.users.length, "users");
      console.log("Sample user:", result.users[0]);
      return res.status(200).json({
        data: result.users,
        pagination: result.pagination,
      });
    } catch (e) {
      console.error("Error in getUsersWithoutPTRole:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async createTrainer(req, res) {
    try {
      const userId = req.user.id;
      console.log("=== CREATE TRAINER ===");
      console.log("userId:", userId);
      console.log("req.body:", req.body);
      const trainer = await ownerTrainerService.createTrainer(userId, req.body);
      return res.status(201).json({
        message: "Tạo PT thành công",
        data: trainer,
      });
    } catch (e) {
      console.error("❌ Error in createTrainer controller:", e.message);
      console.error("Stack:", e.stack);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async updateTrainer(req, res) {
    try {
      const userId = req.user.id;
      const trainerId = req.params.id;
      const trainer = await ownerTrainerService.updateTrainer(userId, trainerId, req.body);
      return res.status(200).json({
        message: "Cập nhật PT thành công",
        data: trainer,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async deleteTrainer(req, res) {
    try {
      const userId = req.user.id;
      const trainerId = req.params.id;
      const result = await ownerTrainerService.deleteTrainer(userId, trainerId);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getTrainerSchedule(req, res) {
    try {
      const userId = req.user.id;
      const trainerId = req.params.id;
      const query = req.query;
      const result = await ownerTrainerService.getTrainerSchedule(userId, trainerId, query);
      return res.status(200).json({ data: result });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getTrainerDetail(req, res) {
    try {
      const userId = req.user.id;
      const trainerId = req.params.id;
      const result = await ownerTrainerService.getTrainerDetail(userId, trainerId);
      return res.status(200).json({ data: result });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async toggleTrainerStatus(req, res) {
    try {
      const userId = req.user.id;
      const trainerId = req.params.id;
      const result = await ownerTrainerService.toggleTrainerStatus(userId, trainerId);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async uploadTrainerCertificates(req, res) {
    try {
      const userId = req.user.id;
      const trainerId = req.params.id;
      const result = await ownerTrainerService.uploadTrainerCertificates(userId, trainerId, req.files || []);
      return res.status(200).json({
        message: "Upload chứng chỉ thành công",
        data: result,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerTrainerController;
