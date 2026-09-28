import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { asyncHandler } from "../lib/asyncHandler.js";

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
  // OSRS item ID to render on the tile instead of its title text (see
  // ItemManager.getImage() on the plugin side). Optional — omit to keep the
  // existing text-only tile rendering.
  iconItemId: z.number().int().positive().optional(),
  criteria: z
    .object({
      metric: z.enum(["kill_count", "item_obtained", "activity_completion"]),
      mode: z.enum(["sum", "each", "and_or"]),
      // Required for sum/each, unused for and_or (see the refine below).
      target: z.number().int().positive().optional(),
      sources: z.array(z.string()).min(1).optional(),
      // EACH mode only — per-source override of target, e.g. {"Goblin": 2,
      // "Chicken": 3}. A source missing from this map uses `target` instead.
      sourceTargets: z.record(z.string(), z.number().int().positive()).optional(),
      // AND_OR mode only — every group needs at least one satisfied
      // condition for the tile to complete, e.g. [{conditions: [{source:
      // "Bones", target: 1}, {source: "Big bones", target: 1}]}, ...].
      groups: z
        .array(
          z.object({
            conditions: z
              .array(z.object({ source: z.string(), target: z.number().int().positive() }))
              .min(1),
          })
        )
        .min(1)
        .optional(),
    })
    .refine(
      (c) => (c.mode === "and_or" ? !!c.groups : c.target !== undefined && !!c.sources),
      { message: "and_or mode requires groups; sum/each modes require target and sources" }
    ),
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
router.post("/boards", requireAdmin, asyncHandler(async (req, res) => {
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
          iconItemId: tile.iconItemId ?? null,
          metric: tile.criteria.metric.toUpperCase() as "KILL_COUNT" | "ITEM_OBTAINED" | "ACTIVITY_COMPLETION",
          mode: tile.criteria.mode.toUpperCase() as "SUM" | "EACH" | "AND_OR",
          // For AND_OR, target/sources are unused by completion logic, but
          // the DB columns are non-null — target gets a placeholder, and
          // sources gets the flattened union of every group's conditions so
          // the plugin's client-side matcher (which only checks metric+source,
          // not the group structure) still knows which events are relevant.
          target: tile.criteria.target ?? 1,
          sources:
            tile.criteria.mode === "and_or"
              ? [...new Set(tile.criteria.groups!.flatMap((g) => g.conditions.map((c) => c.source)))]
              : tile.criteria.sources!,
          sourceTargets: tile.criteria.sourceTargets ?? null,
          groups: tile.criteria.groups ?? null,
        })),
      },
    },
    include: { tiles: true },
  });

  res.status(201).json(board);
}));

// POST /admin/boards/:boardId/teams
// Generates a shareable join code — this is the only time it's returned, so
// hand it to the team right away (it's not a secret stored for you to look
// up later, though you can always see it via the admin board-state view).
router.post("/boards/:boardId/teams", requireAdmin, asyncHandler(async (req, res) => {
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
}));

export default router;
