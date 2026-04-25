import { Server as SocketIOServer } from "socket.io";
import jwtAction from "./middleware/JWTAction";
import db from "./models";

let io;

const getTokenFromSocket = (socket) => {
  const authToken = socket.handshake?.auth?.token;
  if (authToken) return authToken;
  const header = socket.handshake?.headers?.authorization || "";
  const [type, token] = header.split(" ");
  if (type === "Bearer" && token) return token;
  return null;
};

async function hydrateActor(userId) {
  const user = await db.User.findByPk(userId, {
    include: [
      { model: db.Group, attributes: ["name"] },
      { model: db.Member, attributes: ["id", "gymId"] },
      { model: db.Trainer, attributes: ["id", "gymId"] },
      { model: db.Gym, as: "ownedGym", attributes: ["id"] },
    ],
  });
  if (!user) return null;

  return {
    userId: user.id,
    status: user.status,
    groupName: user.Group?.name || null,
    memberId: user.Member?.id || null,
    trainerId: user.Trainer?.id || null,
    gymId: user.Member?.gymId || user.Trainer?.gymId || user.ownedGym?.id || null,
  };
}

function joinActorRooms(socket, actor) {
  socket.join(`user:${actor.userId}`);
  if (actor.groupName) socket.join(`group:${String(actor.groupName).toLowerCase()}`);
  if (actor.memberId) socket.join(`member:${actor.memberId}`);
  if (actor.trainerId) socket.join(`trainer:${actor.trainerId}`);
  if (actor.gymId) socket.join(`gym:${actor.gymId}`);
}

function canJoinConversation(actorUserId, conversationKey) {
  const key = String(conversationKey || "");
  const m = key.match(/^(\d+)_(\d+)$/);
  if (!m) return false;
  const left = Number(m[1]);
  const right = Number(m[2]);
  return actorUserId === left || actorUserId === right;
}

export const initSocket = (httpServer) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
  const isAllowedSocketOrigin = (origin) => {
    if (!origin) return true;
    const o = String(origin);
    if (o === FRONTEND_URL) return true;
    const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o);
    const feLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(String(FRONTEND_URL));
    return Boolean(feLocal && localOrigin);
  };

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, cb) => cb(null, isAllowedSocketOrigin(origin)),
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = getTokenFromSocket(socket);
      if (!token) return next(new Error("Unauthorized"));
      const decoded = jwtAction.verifyToken(token);
      if (!decoded?.id) return next(new Error("Unauthorized"));
      const actor = await hydrateActor(decoded.id);
      if (!actor) return next(new Error("Unauthorized"));
      if (String(actor.status || "active").toLowerCase() !== "active") {
        return next(new Error("Unauthorized"));
      }
      socket.data.user = decoded;
      socket.data.actor = actor;
      return next();
    } catch (e) {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const actor = socket.data.actor;
    joinActorRooms(socket, actor);

    socket.on("conversation:join", ({ conversationKey }) => {
      if (!conversationKey) return;
      if (!canJoinConversation(socket.data?.actor?.userId, conversationKey)) return;
      socket.join(`conversation:${conversationKey}`);
    });

    socket.on("conversation:leave", ({ conversationKey }) => {
      if (!conversationKey) return;
      socket.leave(`conversation:${conversationKey}`);
    });

    socket.on("conversation:typing", ({ conversationKey, isTyping }) => {
      if (!conversationKey) return;
      io.to(`conversation:${conversationKey}`).emit("conversation:typing", {
        conversationKey,
        senderId: socket.data?.actor?.userId,
        isTyping: Boolean(isTyping),
      });
    });
  });

  return io;
};

export const getSocket = () => io;
export const emitToRoom = (room, event, payload) => io?.to(room).emit(event, payload);
export const emitToUser = (userId, event, payload) => emitToRoom(`user:${userId}`, event, payload);
export const emitToTrainer = (trainerId, event, payload) => emitToRoom(`trainer:${trainerId}`, event, payload);
export const emitToMember = (memberId, event, payload) => emitToRoom(`member:${memberId}`, event, payload);
export const emitToGym = (gymId, event, payload) => emitToRoom(`gym:${gymId}`, event, payload);
export const emitToGroup = (groupName, event, payload) => emitToRoom(`group:${String(groupName).toLowerCase()}`, event, payload);
export const emitToConversation = (conversationKey, event, payload) => emitToRoom(`conversation:${conversationKey}`, event, payload);

export default {
  initSocket,
  getSocket,
  emitToRoom,
  emitToUser,
  emitToTrainer,
  emitToMember,
  emitToGym,
  emitToGroup,
  emitToConversation,
};
