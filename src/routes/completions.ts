import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { applyCompletionEvent, type ProgressState, type TileCriteria } from "../lib/completionLogic.js";
import { type AuthedRequest, authenticateTeam } from "../middleware/authenticateTeam.js";
import { computeScore } from "../scoring.js";
import { getIO } from "../socket.js";

const router = Router();

const completionSchema = z.object({
  tileId: z.string(),
  metric: z.enum(["KILL_COUNT", "ITEM_OBTAINED", "ACTIVITY_COMPLETION"]),
  source: z.string(),
  amount: z.number().int().positive().default(1),
  rawEvidence: z.string().optional(),
});

// POST /completions { tileId, metric, source, amount, rawEvidence }
// What the plugin calls the moment it detects a matching game event. This is
// the one endpoint that actually changes board state and broadcasts to the
// team over the socket — everything else here is either auth or reads.
router.post("/", authenticateTeam, async (req: AuthedRequest, res) => {
  const parsed = completionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { tileId, metric, source, amount, rawEvidence } = parsed.data;
  const { teamId, boardId, rsn } = req.team!;

  const tile = await prisma.tile.findUnique({ where: { id: tileId } });
  if (!tile || tile.boardId !== boardId) {
    res.status(404).json({ error: "No such tile on this board" });
    return;
  }

  const existing = await prisma.tileProgress.findUnique({
    where: { teamId_tileId: { teamId, tileId } },
  });

  const criteria: TileCriteria = {
    // tile.metric/tile.mode are Prisma's generated enum types; their runtime
    // values are exactly these strings, so this cast just bridges the two
    // type systems rather than changing anything at runtime.
    metric: tile.metric as TileCriteria["metric"],
    mode: tile.mode as TileCriteria["mode"],
    target: tile.target,
    sources: tile.sources,
    repeatable: tile.repeatable,
  };
  const before: ProgressState = existing
    ? {
        sumProgress: existing.sumProgress,
        eachProgress: (existing.eachProgress as Record<string, number>) ?? {},
        repeatCount: existing.repeatCount,
        completedAt: existing.completedAt,
      }
    : { sumProgress: 0, eachProgress: {}, repeatCount: 0, completedAt: null };

  const result = applyCompletionEvent(criteria, before, { metric, source, amount });

  if (result.rejected) {
    // Not an error — the client detected something real, it just doesn't
    // match this tile (wrong source, tile already done, etc).
    res.status(200).json({ accepted: false, reason: result.rejected });
    return;
  }

  const updated = await prisma.tileProgress.upsert({
    where: { teamId_tileId: { teamId, tileId } },
    update: {
      sumProgress: result.progress.sumProgress,
      eachProgress: result.progress.eachProgress,
      repeatCount: result.progress.repeatCount,
      completedAt: result.progress.completedAt,
    },
    create: {
      teamId,
      tileId,
      sumProgress: result.progress.sumProgress,
      eachProgress: result.progress.eachProgress,
      repeatCount: result.progress.repeatCount,
      completedAt: result.progress.completedAt,
    },
  });

  await prisma.completionEvent.create({
    data: { teamId, tileId, reportedBy: rsn, metric, source, amount, rawEvidence },
  });

  // Recompute the whole team's score and push it to every connected teammate.
  const board = await prisma.board.findUniqueOrThrow({ where: { id: boardId } });
  const allTiles = await prisma.tile.findMany({ where: { boardId } });
  const allProgress = await prisma.tileProgress.findMany({ where: { teamId } });
  const progressByTile = new Map(allProgress.map((p) => [p.tileId, p]));
  const scoredTiles = allTiles.map((t) => {
    const p = progressByTile.get(t.id);
    return {
      row: t.row,
      col: t.col,
      points: t.points,
      bonusPerRepeat: t.bonusPerRepeat,
      completed: !!p?.completedAt,
      repeatCount: p?.repeatCount ?? 0,
    };
  });
  const score = computeScore(board, scoredTiles);

  getIO()
    .to(`team:${teamId}`)
    .emit("tile_update", {
      tileId,
      completed: !!updated.completedAt,
      repeatCount: updated.repeatCount,
      sumProgress: updated.sumProgress,
      eachProgress: updated.eachProgress,
      justCompleted: result.justCompleted,
      repeatCredited: result.repeatCredited,
      reportedBy: rsn,
      score,
    });

  res.json({ accepted: true, justCompleted: result.justCompleted, repeatCredited: result.repeatCredited, score });
});

export default router;
