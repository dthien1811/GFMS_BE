import { Op } from "sequelize";
import db from "../models";
import { attachGymIdsToNotifications } from "./notification-gym.service";
import { emitToConversation, emitToGroup, emitToGym, emitToMember, emitToTrainer, emitToUser } from "../socket";

const normalizePayload = (payload = {}) => ({ ...payload, ts: new Date().toISOString() });

async function getAdministratorUserIds() {
  const users = await db.User.findAll({
    attributes: ["id"],
    include: [
      {
        model: db.Group,
        required: true,
        attributes: [],
        where: { name: { [Op.in]: ["Administrators", "Administrator"] } },
      },
    ],
  });
  return [...new Set(users.map((u) => Number(u.id)).filter((id) => Number.isFinite(id) && id > 0))];
}

const realtimeService = {
  async notifyUser(userId, payload) {
    if (!userId || !payload?.title || !payload?.message) return null;
    const row = await db.Notification.create({
      userId,
      title: payload.title,
      message: payload.message,
      notificationType: payload.notificationType || payload.type || "system",
      relatedType: payload.relatedType || null,
      relatedId: payload.relatedId || null,
      isRead: false,
    });
    const [enrichedPayload] = await attachGymIdsToNotifications([
      { id: row.id, ...payload, isRead: false, createdAt: row.createdAt },
    ]);
    emitToUser(userId, "notification:new", normalizePayload(enrichedPayload));
    return row;
  },

  async notifyUsers(userIds = [], payload) {
    const ids = [...new Set((userIds || []).filter(Boolean).map(Number))];
    const rows = [];
    for (const userId of ids) {
      const row = await this.notifyUser(userId, payload);
      if (row) rows.push(row);
    }
    return rows;
  },

  /** Persist + socket to every user in Administrators group (GFMS admin console). */
  async notifyAdministrators(payload) {
    if (!payload?.title || !payload?.message) return [];
    try {
      const ids = await getAdministratorUserIds();
      if (!ids.length) return [];
      return await this.notifyUsers(ids, payload);
    } catch (e) {
      console.error("[realtime] notifyAdministrators:", e?.message || e);
      return [];
    }
  },

  emitMessage(conversationKey, payload) {
    emitToConversation(conversationKey, "message:new", normalizePayload(payload));
  },

  emitRead(conversationKey, payload) {
    emitToConversation(conversationKey, "message:read", normalizePayload(payload));
  },

  emitUser(userId, event, payload) { emitToUser(userId, event, normalizePayload(payload)); },
  emitGym(gymId, event, payload) { emitToGym(gymId, event, normalizePayload(payload)); },
  emitTrainer(trainerId, event, payload) { emitToTrainer(trainerId, event, normalizePayload(payload)); },
  emitMember(memberId, event, payload) { emitToMember(memberId, event, normalizePayload(payload)); },
  emitGroup(groupName, event, payload) { emitToGroup(groupName, event, normalizePayload(payload)); },
};

export default realtimeService;
