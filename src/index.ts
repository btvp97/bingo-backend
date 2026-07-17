import { createServer } from "node:http";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { env } from "./env.js";
import adminRouter from "./routes/admin.js";
import boardsRouter from "./routes/boards.js";
import completionsRouter from "./routes/completions.js";
import teamsRouter from "./routes/teams.js";
import { initSocket } from "./socket.js";

// Last line of defense: anything that still escapes asyncHandler (e.g. an
// error thrown outside a request, or inside a Socket.IO event handler)
// otherwise crashes the whole process per Node's default behavior. Log it
// and keep running instead — one bad request/event shouldn't take down
// every other team's connection.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/admin", adminRouter);
app.use("/teams", teamsRouter);
app.use("/boards", boardsRouter);
app.use("/completions", completionsRouter);

// Catches errors forwarded via next(err) from asyncHandler-wrapped routes.
// Must be registered after all routes, and must have exactly 4 params for
// Express to recognize it as an error handler.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ error: "Internal server error" });
});

// Express and Socket.IO share one underlying HTTP server so both REST calls
// and the WebSocket upgrade land on the same port.
const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(env.port, () => {
  console.log(`Bingo backend listening on :${env.port}`);
});
