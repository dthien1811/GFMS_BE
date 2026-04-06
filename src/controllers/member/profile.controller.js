import memberProfileService from "../../service/member/profile.service";

const memberProfileController = {
  async getMyProfile(req, res) {
    try {
      const data = await memberProfileService.getMyProfile(req.user.id);
      return res.status(200).json({
        EM: "Get profile success",
        EC: 0,
        DT: data,
      });
    } catch (e) {
      console.error("getMyProfile controller error:", e);
      return res.status(e.statusCode || 500).json({
        EM: e.message || "Error from server",
        EC: e.statusCode ? 1 : -1,
        DT: "",
      });
    }
  },

  async updateMyProfile(req, res) {
    try {
      const data = await memberProfileService.updateMyProfile(req.user.id, req.body || {});
      return res.status(200).json({
        EM: "Update profile success",
        EC: 0,
        DT: data,
      });
    } catch (e) {
      console.error("updateMyProfile controller error:", e);
      return res.status(e.statusCode || 500).json({
        EM: e.message || "Error from server",
        EC: e.statusCode ? 1 : -1,
        DT: "",
      });
    }
  },

  async changeMyPassword(req, res) {
    try {
      await memberProfileService.changeMyPassword(req.user.id, req.body || {});
      return res.status(200).json({
        EM: "Change password success",
        EC: 0,
        DT: "",
      });
    } catch (e) {
      console.error("changeMyPassword controller error:", e);
      return res.status(e.statusCode || 500).json({
        EM: e.message || "Error from server",
        EC: e.statusCode ? 1 : -1,
        DT: "",
      });
    }
  },

  async createBecomeTrainerRequest(req, res) {
    try {
      const data = await memberProfileService.createBecomeTrainerRequest(req.user.id, req.body || {});
      return res.status(201).json({
        EM: "Gửi đơn trở thành huấn luyện viên thành công",
        EC: 0,
        DT: data,
      });
    } catch (e) {
      console.error("createBecomeTrainerRequest controller error:", e);
      return res.status(e.statusCode || 500).json({
        EM: e.message || "Error from server",
        EC: e.statusCode ? 1 : -1,
        DT: "",
      });
    }
  },

  async getMyBecomeTrainerRequests(req, res) {
    try {
      const data = await memberProfileService.getMyBecomeTrainerRequests(req.user.id);
      return res.status(200).json({
        EM: "Get become trainer requests success",
        EC: 0,
        DT: data,
      });
    } catch (e) {
      console.error("getMyBecomeTrainerRequests controller error:", e);
      return res.status(e.statusCode || 500).json({
        EM: e.message || "Error from server",
        EC: e.statusCode ? 1 : -1,
        DT: "",
      });
    }
  },
};

export default memberProfileController;