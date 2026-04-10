import db from "../models";
import { attachGymIdsToNotifications } from "./notification-gym.service";
import { emitToConversation, emitToGroup, emitToGym, emitToMember, emitToTrainer, emitToUser } from "../socket";

const normalizePayload = (payload = {}) => ({ ...payload, ts: new Date().toISOString() });

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
    for (const userId of ids) rows.push(await this.notifyUser(userId, payload));
    return rows;
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
