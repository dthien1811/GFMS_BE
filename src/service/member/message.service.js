import { Op } from "sequelize";
import db from "../../models";
import chatPolicyService from "../chatPolicy.service";
import realtimeService from "../realtime.service";
import chatPreviewService from "../chatPreview.service";

function buildConversationKey(a, b) {
  return [Number(a), Number(b)].sort((x, y) => x - y).join("_");
}

async function getMessagePayload(messageId) {
  return db.Message.findByPk(messageId, {
    include: [
      { model: db.User, as: "sender", attributes: ["id", "username", "avatar"] },
      { model: db.User, as: "receiver", attributes: ["id", "username", "avatar"] },
    ],
  });
}

async function getMemberByUserId(userId) {
  return db.Member.findOne({ where: { userId }, attributes: ["id", "gymId"] });
}

function parseSocialLinks(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function isAbsoluteHttpUrl(v) {
  return typeof v === "string" && /^https?:\/\//i.test(v.trim());
}

function pickTrainerAvatarUrl(trainer) {
  const sl = parseSocialLinks(trainer?.socialLinks);
  const profileUrl = sl?.profileImages?.avatarUrl ? String(sl.profileImages.avatarUrl).trim() : "";

  const rawUser = trainer?.User?.avatar ? String(trainer.User.avatar).trim() : "";
  const userIsPlaceholder = !rawUser || /default-avatar/i.test(rawUser);
  const userIsAbsolute = isAbsoluteHttpUrl(rawUser);

  if (profileUrl && isAbsoluteHttpUrl(profileUrl)) return profileUrl;
  if (!userIsPlaceholder && userIsAbsolute) return rawUser;
  if (profileUrl) return profileUrl;
  return null;
}

const messageService = {
  buildConversationKey,

  async getEligibleConversations(userId) {
    const member = await getMemberByUserId(userId);
    if (!member) return [];

    const trainerIds = await chatPolicyService.getAllowedTrainerIdsForMember(userId);
    if (!trainerIds.length) return [];

    const trainers = await db.Trainer.findAll({
      where: { id: trainerIds },
      attributes: ["id", "userId", "gymId", "status", "socialLinks"],
      include: [{ model: db.User, attributes: ["id", "username", "avatar"] }],
      order: [[db.User, "username", "ASC"]],
    });

    const rows = await Promise.all(trainers.map(async (trainer) => {
      const lastMessage = await db.Message.findOne({
        where: {
          [Op.or]: [
            { senderId: userId, receiverId: trainer.userId },
            { senderId: trainer.userId, receiverId: userId },
          ],
        },
        order: [["createdAt", "DESC"]],
      });
      const unreadCount = await db.Message.count({
        where: { senderId: trainer.userId, receiverId: userId, isRead: false },
      });
      return {
        conversationKey: buildConversationKey(userId, trainer.userId),
        trainerId: trainer.id,
        trainerUserId: trainer.userId,
        trainerName: trainer.User?.username || `PT #${trainer.id}`,
        trainerAvatar: pickTrainerAvatarUrl(trainer),
        lastMessage: chatPreviewService.previewTextFromContent(lastMessage?.content || "") || null,
        lastMessageAt: lastMessage?.createdAt || null,
        unreadCount,
      };
    }));

    return rows.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
  },

  async listMessages(currentUserId, peerUserId) {
    const trainer = await db.Trainer.findOne({ where: { userId: Number(peerUserId) }, attributes: ["id"] });
    if (!trainer) {
      const e = new Error("Người nhận không phải PT hợp lệ.");
      e.statusCode = 404;
      throw e;
    }
    await chatPolicyService.assertMemberCanChatTrainer(currentUserId, trainer.id);

    return db.Message.findAll({
      where: {
        [Op.or]: [
          { senderId: currentUserId, receiverId: Number(peerUserId) },
          { senderId: Number(peerUserId), receiverId: currentUserId },
        ],
      },
      include: [
        { model: db.User, as: "sender", attributes: ["id", "username", "avatar"] },
        { model: db.User, as: "receiver", attributes: ["id", "username", "avatar"] },
      ],
      order: [["createdAt", "ASC"]],
    });
  },

  async sendMessage(currentUserId, peerUserId, content) {
    const trimmed = String(content || "").trim();
    if (!trimmed) {
      const e = new Error("Nội dung tin nhắn không được để trống.");
      e.statusCode = 400;
      throw e;
    }
    if (trimmed.length > 2000) {
      const e = new Error("Tin nhắn tối đa 2000 ký tự.");
      e.statusCode = 400;
      throw e;
    }

    const trainer = await db.Trainer.findOne({ where: { userId: Number(peerUserId) }, attributes: ["id"] });
    if (!trainer) {
      const e = new Error("Người nhận không phải PT hợp lệ.");
      e.statusCode = 404;
      throw e;
    }
    await chatPolicyService.assertMemberCanChatTrainer(currentUserId, trainer.id);

    const conversationKey = buildConversationKey(currentUserId, peerUserId);
    const row = await db.Message.create({
      senderId: currentUserId,
      receiverId: Number(peerUserId),
      content: trimmed,
      isRead: false,
    });

    const saved = await getMessagePayload(row.id);
    const payload = {
      id: saved.id,
      conversationKey,
      senderId: saved.senderId,
      receiverId: saved.receiverId,
      content: saved.content,
      isRead: saved.isRead,
      createdAt: saved.createdAt,
      sender: saved.sender,
      receiver: saved.receiver,
    };

    realtimeService.emitMessage(conversationKey, payload);
    realtimeService.notifyUser(Number(peerUserId), {
      title: "Tin nhắn mới từ hội viên",
      message: chatPreviewService.previewTextFromContent(trimmed).slice(0, 160),
      notificationType: "chat",
      relatedType: "message",
      relatedId: row.id,
    }).catch((err) => console.error("notifyUser chat error:", err?.message || err));

    return payload;
  },

  async markConversationRead(currentUserId, peerUserId) {
    const trainer = await db.Trainer.findOne({ where: { userId: Number(peerUserId) }, attributes: ["id"] });
    if (!trainer) {
      const e = new Error("Người nhận không phải PT hợp lệ.");
      e.statusCode = 404;
      throw e;
    }
    await chatPolicyService.assertMemberCanChatTrainer(currentUserId, trainer.id);

    await db.Message.update(
      { isRead: true, readAt: new Date() },
      { where: { senderId: Number(peerUserId), receiverId: currentUserId, isRead: false } }
    );
    const conversationKey = buildConversationKey(currentUserId, peerUserId);
    realtimeService.emitRead(conversationKey, { readerId: currentUserId, peerUserId: Number(peerUserId) });
    return { ok: true, conversationKey };
  },
};

export default messageService;
