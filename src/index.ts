import { createServer } from "node:http";
import express from "express";
import { env } from "./env.js";
import adminRouter from "./routes/admin.js";
import boardsRouter from "./routes/boards.js";
import completionsRouter from "./routes/completions.js";
import teamsRouter from "./routes/teams.js";
import { initSocket } from "./socket.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/admin", adminRouter);
app.use("/teams", teamsRouter);
app.use("/boards", boardsRouter);
app.use("/completions", completionsRouter);

// Express and Socket.IO share one underlying HTTP server so both REST calls
// and the WebSocket upgrade land on the same port.
const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(env.port, () => {
  console.log(`Bingo backend listening on :${env.port}`);
});
