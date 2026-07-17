import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";

const router = Router();

// Every /admin/* route requires this header — it's you, the board organizer,
// not a player. Kept as a single shared secret for now (see backend-data-model.md
// on why this is fine at single-clan scale and what'd need to change for
// self-serve multi-clan use later).
function requireAdmin(req: any, res: any, next: any) {
  if (req.headers["x-admin-secret"] !== env.adminSecret) {
    res.status(401).json({ error: "Bad admin secret" });
    return;
  }
  next();
}

const tileSchema = z.object({
  title: z.string(),
  points: z.number().int(),
  repeatable: z.boolean().optional(),
  bonusPerRepeat: z.number().int().optional(),
  criteria: z.object({
    metric: z.enum(["kill_count", "item_obtained", "activity_completion"]),
    mode: z.enum(["sum", "each"]),
    target: z.number().int().positive(),
    sources: z.array(z.string()).min(1),
  }),
});

const createBoardSchema = z.object({
  clanId: z.string(),
  name: z.string(),
  cols: z.number().int().positive(),
  bonuses: z.object({
    horizontal: z.number().int().default(0),
    vertical: z.number().int().default(0),
    diagonal: z.number().int().default(0),
    blackout: z.number().int().default(0),
  }),
  tiles: z.array(tileSchema).min(1),
});

// POST /admin/boards
// Body is the same shape as tile-criteria-schema.md's board JSON, plus a
// clanId and explicit cols (the source JSON doesn't carry grid layout).
router.post("/boards", requireAdmin, async (req, res) => {
  const parsed = createBoardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { clanId, name, cols, bonuses, tiles } = parsed.data;
  if (tiles.length % cols !== 0) {
    res.status(400).json({ error: `${tiles.length} tiles doesn't divide evenly into ${cols} columns` });
    return;
  }
  const rows = tiles.length / cols;

  const board = await prisma.board.create({
    data: {
      clanId,
      name,
      rows,
      cols,
      bonusHorizontal: bonuses.horizontal,
      bonusVertical: bonuses.vertical,
      bonusDiagonal: bonuses.diagonal,
      bonusBlackout: bonuses.blackout,
      status: "ACTIVE",
      tiles: {
        create: tiles.map((tile, index) => ({
          title: tile.title,
          points: tile.points,
          row: Math.floor(index / cols),
          col: index % cols,
          repeatable: tile.repeatable ?? false,
          bonusPerRepeat: tile.bonusPerRepeat ?? null,
          metric: tile.criteria.metric.toUpperCase() as "KILL_COUNT" | "ITEM_OBTAINED" | "ACTIVITY_COMPLETION",
          mode: tile.criteria.mode.toUpperCase() as "SUM" | "EACH",
          target: tile.criteria.target,
          sources: tile.criteria.sources,
        })),
      },
    },
    include: { tiles: true },
  });

  res.status(201).json(board);
});

// POST /admin/boards/:boardId/teams
// Generates a shareable join code — this is the only time it's returned, so
// hand it to the team right away (it's not a secret stored for you to look
// up later, though you can always see it via the admin board-state view).
router.post("/boards/:boardId/teams", requireAdmin, async (req, res) => {
  const parsed = z.object({ name: z.string() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const joinCode = crypto.randomBytes(4).toString("hex"); // 8 hex chars, e.g. "a3f9c1de"

  const team = await prisma.team.create({
    data: { boardId: req.params.boardId, name: parsed.data.name, joinCode },
  });

  res.status(201).json(team);
});

export default router;
