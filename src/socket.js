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

export const initSocket = (httpServer) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: FRONTEND_URL,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = getTokenFromSocket(socket);
    if (!token) return next(new Error("Unauthorized"));
    const decoded = jwtAction.verifyToken(token);
    if (!decoded) return next(new Error("Unauthorized"));
    socket.data.user = decoded;
    return next();
  });

  io.on("connection", async (socket) => {
    const userId = socket.data?.user?.id;
    if (userId) {
      socket.join(`user:${userId}`);
    }

    try {
      const trainer = await db.Trainer.findOne({
        where: { userId },
        attributes: ["id"],
      });
      if (trainer?.id) {
        socket.join(`trainer:${trainer.id}`);
      }
    } catch (e) {
      // ignore lookup errors
    }
  });

  return io;
};

export const getSocket = () => io;

export const emitToUser = (userId, event, payload) => {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
};

export const emitToTrainer = (trainerId, event, payload) => {
  if (!io || !trainerId) return;
  io.to(`trainer:${trainerId}`).emit(event, payload);
};

export default {
  initSocket,
  getSocket,
  emitToUser,
  emitToTrainer,
};
