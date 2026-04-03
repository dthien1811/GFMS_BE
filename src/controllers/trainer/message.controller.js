import trainerMessageService from "../../service/trainer/message.service";

const trainerMessageController = {
  async getEligibleConversations(req, res) {
    try {
      const data = await trainerMessageService.getEligibleConversations(req.user.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
  async listMessages(req, res) {
    try {
      const data = await trainerMessageService.listMessages(req.user.id, Number(req.params.peerUserId));
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
  async sendMessage(req, res) {
    try {
      const data = await trainerMessageService.sendMessage(req.user.id, Number(req.params.peerUserId), req.body?.content);
      return res.status(201).json({ data, message: "Gửi tin nhắn thành công" });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
  async markConversationRead(req, res) {
    try {
      const data = await trainerMessageService.markConversationRead(req.user.id, Number(req.params.peerUserId));
      return res.status(200).json({ data, message: "Đã đánh dấu đã đọc" });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default trainerMessageController;
