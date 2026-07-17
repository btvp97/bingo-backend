import { Router } from "express";
import { prisma } from "../db.js";
import { type AuthedRequest, authenticateTeam } from "../middleware/authenticateTeam.js";
import { computeScore } from "../scoring.js";

const router = Router();

// GET /boards/:boardId/state
// What the plugin's side panel renders from: every tile on the board, plus
// this team's current progress and score.
router.get("/:boardId/state", authenticateTeam, async (req: AuthedRequest, res) => {
  const { boardId } = req.params;
  if (req.team!.boardId !== boardId) {
    res.status(403).json({ error: "Token is not valid for this board" });
    return;
  }

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: { tiles: { orderBy: [{ row: "asc" }, { col: "asc" }] } },
  });
  if (!board) {
    res.status(404).json({ error: "No such board" });
    return;
  }

  const progress = await prisma.tileProgress.findMany({
    where: { teamId: req.team!.teamId, tileId: { in: board.tiles.map((t) => t.id) } },
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

  res.json({
    board: { id: board.id, name: board.name, rows: board.rows, cols: board.cols },
    tiles,
    score,
  });
});

export default router;
