import { emitToUser } from "../../socket";
import notificationService from "../../service/notification.service";

const ownerNotificationController = {
  async listMine(req, res) {
    try {
      const data = await notificationService.listMine(req.user.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
  async markRead(req, res) {
    try {
      const row = await notificationService.markRead(req.user.id, Number(req.params.id));
      emitToUser(req.user.id, "notification:read", { id: row.id });
      return res.status(200).json({ data: row, message: "Đã đọc" });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
  async markAllRead(req, res) {
    try {
      await notificationService.markAllRead(req.user.id, req.query);
      emitToUser(req.user.id, "notification:read-all", { ok: true });
      return res.status(200).json({ ok: true, message: "Đã đọc tất cả" });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerNotificationController;