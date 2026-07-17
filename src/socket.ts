import type { Server as HTTPServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { verifyTeamToken } from "./auth.js";

let io: SocketIOServer | undefined;

// Socket.IO "rooms" are just tags a connection can be subscribed to — we use
// one room per team ("team:<id>") so `io.to(room).emit(...)` reaches every
// connected teammate and no one else.
export function initSocket(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, { cors: { origin: "*" } });

  // Runs once per new connection, before "connection" fires — this is where
  // we check the JWT the plugin sent when opening the socket.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error("Missing token"));
      return;
    }
    try {
      socket.data.team = verifyTeamToken(token);
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const { teamId } = socket.data.team as { teamId: string };
    socket.join(`team:${teamId}`);
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.IO not initialized yet — initSocket() must run first");
  return io;
}
