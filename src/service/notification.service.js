import { Op } from "sequelize";
import db from "../models";
import { attachGymIdsToNotifications, matchesNotificationGym } from "./notification-gym.service";

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
  async listMine(userId, { limit = 30, unreadOnly = false, gymId } = {}) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const scopedGymId = Number.isInteger(Number(gymId)) && Number(gymId) > 0 ? Number(gymId) : null;
    const listWhere = { userId };
    if (String(unreadOnly) === "true" || unreadOnly === true) listWhere.isRead = false;

    if (!scopedGymId) {
      const [items, unreadCount] = await Promise.all([
        db.Notification.findAll({ where: listWhere, order: [["createdAt", "DESC"]], limit: parsedLimit }),
        db.Notification.count({ where: { userId, isRead: false } }),
      ]);

      return { items: await attachGymIdsToNotifications(items), unreadCount };
    }

    const baseAttributes = ["id", "userId", "title", "message", "notificationType", "relatedType", "relatedId", "isRead", "createdAt", "updatedAt"];
    const [allItems, allUnreadItems] = await Promise.all([
      db.Notification.findAll({ where: listWhere, attributes: baseAttributes, order: [["createdAt", "DESC"]], raw: true }),
      db.Notification.findAll({ where: { userId, isRead: false }, attributes: baseAttributes, raw: true }),
    ]);

    const [enrichedItems, enrichedUnreadItems] = await Promise.all([
      attachGymIdsToNotifications(allItems),
      attachGymIdsToNotifications(allUnreadItems),
    ]);

    return {
      items: enrichedItems.filter((item) => matchesNotificationGym(item, scopedGymId)).slice(0, parsedLimit),
      unreadCount: enrichedUnreadItems.filter((item) => matchesNotificationGym(item, scopedGymId)).length,
    };
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

  async markAllRead(userId, { gymId } = {}) {
    const scopedGymId = Number.isInteger(Number(gymId)) && Number(gymId) > 0 ? Number(gymId) : null;

    if (!scopedGymId) {
      await db.Notification.update({ isRead: true }, { where: { userId, isRead: false } });
      return { ok: true };
    }

    const unreadItems = await db.Notification.findAll({
      where: { userId, isRead: false },
      attributes: ["id", "notificationType", "relatedType", "relatedId", "isRead"],
      raw: true,
    });

    const matchingIds = (await attachGymIdsToNotifications(unreadItems))
      .filter((item) => matchesNotificationGym(item, scopedGymId))
      .map((item) => Number(item.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (matchingIds.length > 0) {
      await db.Notification.update(
        { isRead: true },
        { where: { userId, isRead: false, id: { [db.Sequelize.Op.in]: matchingIds } } }
      );
    }

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
