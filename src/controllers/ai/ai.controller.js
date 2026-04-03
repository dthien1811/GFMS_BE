import aiService from "../../service/ai/ai.service";

const aiController = {
  async chat(req, res) {
    try {
      const data = await aiService.chat({
        user: req.user || null,
        body: req.body || {},
      });

      return res.status(200).json({
        EC: 0,
        EM: "OK",
        DT: data,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({
        EC: 1,
        EM: e.message || "AI chat failed",
        DT: null,
      });
    }
  },

  async confirmAction(req, res) {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          EC: 1,
          EM: "Bạn cần đăng nhập để thực hiện thao tác này",
          DT: null,
        });
      }

      const data = await aiService.confirmAction({
        user: req.user,
        action: req.body?.action,
      });

      return res.status(200).json({
        EC: 0,
        EM: "OK",
        DT: data,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({
        EC: 1,
        EM: e.message || "Confirm action failed",
        DT: null,
      });
    }
  },
};

export default aiController;