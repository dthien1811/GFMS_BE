import { Op } from "sequelize";
import db from "../../models";
import chatPolicyService from "../chatPolicy.service";
import realtimeService from "../realtime.service";
import chatPreviewService from "../chatPreview.service";
import memberMessageService from "../member/message.service";

const { buildConversationKey } = memberMessageService;

async function getMessagePayload(messageId) {
  return db.Message.findByPk(messageId, {
    include: [
      { model: db.User, as: "sender", attributes: ["id", "username", "avatar"] },
      { model: db.User, as: "receiver", attributes: ["id", "username", "avatar"] },
    ],
  });
}

const trainerMessageService = {
  async getEligibleConversations(userId) {
    const trainer = await db.Trainer.findOne({ where: { userId }, attributes: ["id"] });
    if (!trainer) return [];

    const memberIds = await chatPolicyService.getAllowedMemberIdsForTrainer(userId);
    if (!memberIds.length) return [];

    const members = await db.Member.findAll({
      where: { id: memberIds },
      attributes: ["id", "userId", "gymId"],
      include: [{ model: db.User, attributes: ["id", "username", "avatar"] }],
      order: [[db.User, "username", "ASC"]],
    });

    // Một user có thể có nhiều Member record (khác gym/khác thời điểm).
    // Ở màn chat PT chỉ cần 1 hội thoại / 1 user để tránh hiển thị trùng.
    const uniqueMembersByUser = new Map();
    for (const member of members) {
      const key = Number(member?.userId || 0);
      if (!key) continue;
      const existed = uniqueMembersByUser.get(key);
      if (!existed || Number(member.id || 0) > Number(existed.id || 0)) {
        uniqueMembersByUser.set(key, member);
      }
    }
    const uniqueMembers = [...uniqueMembersByUser.values()];

    const rows = await Promise.all(uniqueMembers.map(async (member) => {
      const lastMessage = await db.Message.findOne({
        where: {
          [Op.or]: [
            { senderId: userId, receiverId: member.userId },
            { senderId: member.userId, receiverId: userId },
          ],
        },
        order: [["createdAt", "DESC"]],
      });
      const unreadCount = await db.Message.count({
        where: { senderId: member.userId, receiverId: userId, isRead: false },
      });
      return {
        conversationKey: buildConversationKey(userId, member.userId),
        memberId: member.id,
        memberUserId: member.userId,
        memberName: member.User?.username || `Member #${member.id}`,
        memberAvatar: member.User?.avatar || null,
        lastMessage: chatPreviewService.previewTextFromContent(lastMessage?.content || "") || null,
        lastMessageAt: lastMessage?.createdAt || null,
        unreadCount,
      };
    }));
    return rows.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
  },

  async listMessages(currentUserId, peerUserId) {
    await chatPolicyService.assertTrainerCanChatMember(currentUserId, Number(peerUserId));
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

    await chatPolicyService.assertTrainerCanChatMember(currentUserId, Number(peerUserId));
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
    await realtimeService.notifyUser(Number(peerUserId), {
      title: "PT đã trả lời bạn",
      message: chatPreviewService.previewTextFromContent(trimmed).slice(0, 160),
      notificationType: "chat",
      relatedType: "message",
      relatedId: row.id,
    });

    return payload;
  },

  async markConversationRead(currentUserId, peerUserId) {
    await chatPolicyService.assertTrainerCanChatMember(currentUserId, Number(peerUserId));
    await db.Message.update(
      { isRead: true, readAt: new Date() },
      { where: { senderId: Number(peerUserId), receiverId: currentUserId, isRead: false } }
    );
    const conversationKey = buildConversationKey(currentUserId, peerUserId);
    realtimeService.emitRead(conversationKey, { readerId: currentUserId, peerUserId: Number(peerUserId) });
    return { ok: true, conversationKey };
  },
};

export default trainerMessageService;
