import messageService from "../../service/member/message.service";

const messageController = {
  async getEligibleConversations(req, res) {
    try {
      const data = await messageService.getEligibleConversations(req.user.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async listMessages(req, res) {
    try {
      const peerUserId = Number(req.params.peerUserId);
      const data = await messageService.listMessages(req.user.id, peerUserId);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async sendMessage(req, res) {
    try {
      const peerUserId = Number(req.params.peerUserId);
      const data = await messageService.sendMessage(req.user.id, peerUserId, req.body?.content);
      return res.status(201).json({ data, message: "Gửi tin nhắn thành công" });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async markConversationRead(req, res) {
    try {
      const peerUserId = Number(req.params.peerUserId);
      const data = await messageService.markConversationRead(req.user.id, peerUserId);
      return res.status(200).json({ data, message: "Đã đánh dấu đã đọc" });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default messageController;
