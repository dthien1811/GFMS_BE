import { Op } from "sequelize";
import db from "../models";

/** Loại hiển thị trên trang Thông báo PT (không gộp tin nhắn — dùng tab Tin nhắn + icon riêng). */
const PT_CORE_TYPES = ["booking_update", "review", "withdrawal", "request_update"];

const trainerNotificationWhere = (userId, extra = {}) => ({
  userId,
  [Op.or]: [
    { notificationType: { [Op.in]: PT_CORE_TYPES } },
    {
      [Op.and]: [
        { notificationType: "package_purchase" },
        {
          [Op.or]: [{ title: { [Op.is]: null } }, { title: { [Op.notLike]: "%PayOS%" } }],
        },
      ],
    },
  ],
  ...extra,
});

const notificationService = {
  async listMine(userId, { limit = 30, unreadOnly = false } = {}) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const where = { userId };
    if (String(unreadOnly) === "true" || unreadOnly === true) where.isRead = false;

    const [items, unreadCount] = await Promise.all([
      db.Notification.findAll({ where, order: [["createdAt", "DESC"]], limit: parsedLimit }),
      db.Notification.count({ where: { userId, isRead: false } }),
    ]);
    return { items, unreadCount };
  },

  async listMineForTrainer(userId, { limit = 30, unreadOnly = false } = {}) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const base = trainerNotificationWhere(userId);
    if (String(unreadOnly) === "true" || unreadOnly === true) base.isRead = false;

    const [items, unreadCount] = await Promise.all([
      db.Notification.findAll({
        where: base,
        order: [["createdAt", "DESC"]],
        limit: parsedLimit,
      }),
      db.Notification.count({
        where: trainerNotificationWhere(userId, { isRead: false }),
      }),
    ]);
    return { items, unreadCount };
  },

  async markRead(userId, id) {
    const row = await db.Notification.findOne({ where: { id, userId } });
    if (!row) {
      const e = new Error("Không tìm thấy thông báo.");
      e.statusCode = 404;
      throw e;
    }
    if (!row.isRead) await row.update({ isRead: true });
    return row;
  },

  async markAllRead(userId) {
    await db.Notification.update({ isRead: true }, { where: { userId, isRead: false } });
    return { ok: true };
  },

  async markAllReadForTrainer(userId) {
    await db.Notification.update(
      { isRead: true },
      { where: trainerNotificationWhere(userId, { isRead: false }) }
    );
    return { ok: true };
  },
};

export default notificationService;
