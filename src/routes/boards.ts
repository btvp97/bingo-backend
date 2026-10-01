import { Router } from "express";
import { prisma } from "../db.js";
import { type AuthedRequest, authenticateTeam } from "../middleware/authenticateTeam.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { computeScore } from "../scoring.js";

const router = Router();

// Shared by /:boardId/state and /:boardId/teams/:targetTeamId/state — the
// only difference between "my board" and "spectating another team" is which
// teamId the progress rows are pulled for. Tile definitions are board-wide
// (same for every team), so there's nothing extra to leak by reusing this
// for another team: they only ever see the tiles they'd see on their own
// board, with someone else's progress against them.
async function buildBoardStatePayload(boardId: string, teamId: string) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: { tiles: { orderBy: [{ row: "asc" }, { col: "asc" }] } },
  });
  if (!board) return null;

  const progress = await prisma.tileProgress.findMany({
    where: { teamId, tileId: { in: board.tiles.map((t) => t.id) } },
  });
  const progressByTile = new Map(progress.map((p) => [p.tileId, p]));

  const tiles = board.tiles.map((tile) => {
    const p = progressByTile.get(tile.id);
    return {
      id: tile.id,
      title: tile.title,
      points: tile.points,
      row: tile.row,
      col: tile.col,
      repeatable: tile.repeatable,
      target: tile.target,
      // Detection criteria — the plugin needs these to know what game events
      // to watch for. Previously omitted since only the score/progress
      // mattered for rendering; now needed for client-side event matching.
      metric: tile.metric,
      mode: tile.mode,
      sources: tile.sources,
      sourceTargets: tile.sourceTargets,
      groups: tile.groups,
      sets: tile.sets,
      iconItemId: tile.iconItemId,
      completed: !!p?.completedAt,
      repeatCount: p?.repeatCount ?? 0,
      sumProgress: p?.sumProgress ?? 0,
      eachProgress: (p?.eachProgress as Record<string, number> | undefined) ?? {},
    };
  });

  const score = computeScore(
    board,
    board.tiles.map((tile) => {
      const p = progressByTile.get(tile.id);
      return {
        row: tile.row,
        col: tile.col,
        points: tile.points,
        bonusPerRepeat: tile.bonusPerRepeat,
        completed: !!p?.completedAt,
        repeatCount: p?.repeatCount ?? 0,
      };
    })
  );

  return {
    board: { id: board.id, name: board.name, rows: board.rows, cols: board.cols },
    tiles,
    score,
  };
}

// GET /boards/:boardId/state
// What the plugin's side panel renders from: every tile on the board, plus
// this team's current progress and score.
router.get("/:boardId/state", authenticateTeam, asyncHandler(async (req: AuthedRequest, res) => {
  const { boardId } = req.params;
  if (req.team!.boardId !== boardId) {
    res.status(403).json({ error: "Token is not valid for this board" });
    return;
  }

  const payload = await buildBoardStatePayload(boardId, req.team!.teamId);
  if (!payload) {
    res.status(404).json({ error: "No such board" });
    return;
  }

  res.json(payload);
}));

// GET /boards/:boardId/teams
// Lists every other team on this board, for the leaderboard dropdown. Any
// team holding a valid token for this board can see who else is on it —
// names only, no join codes or member lists.
router.get("/:boardId/teams", authenticateTeam, asyncHandler(async (req: AuthedRequest, res) => {
  const { boardId } = req.params;
  if (req.team!.boardId !== boardId) {
    res.status(403).json({ error: "Token is not valid for this board" });
    return;
  }

  const teams = await prisma.team.findMany({
    where: { boardId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  res.json({ teams });
}));

// GET /boards/:boardId/teams/:targetTeamId/state
// Read-only "spectate" view for the leaderboard tab: same shape as
// /:boardId/state, but for whichever team the caller picked from the
// dropdown instead of their own. Still gated by the caller's own board
// token — this isn't a public endpoint.
router.get(
  "/:boardId/teams/:targetTeamId/state",
  authenticateTeam,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { boardId, targetTeamId } = req.params;
    if (req.team!.boardId !== boardId) {
      res.status(403).json({ error: "Token is not valid for this board" });
      return;
    }

    // Confirm the target team actually belongs to this board before using
    // its id — otherwise a caller could probe progress for a team on a
    // different board by guessing its id.
    const targetTeam = await prisma.team.findUnique({ where: { id: targetTeamId } });
    if (!targetTeam || targetTeam.boardId !== boardId) {
      res.status(404).json({ error: "No such team on this board" });
      return;
    }

    const payload = await buildBoardStatePayload(boardId, targetTeamId);
    if (!payload) {
      res.status(404).json({ error: "No such board" });
      return;
    }

    res.json({ ...payload, team: { id: targetTeam.id, name: targetTeam.name } });
  })
);

export default router;
