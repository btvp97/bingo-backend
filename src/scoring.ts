// Score is always computed on read from current tile state, never stored —
// boards are small (~25 tiles) so recomputing on every request/broadcast is
// cheap, and it avoids the score ever drifting out of sync with reality.

export type ScoredTile = {
  row: number;
  col: number;
  points: number;
  bonusPerRepeat: number | null;
  completed: boolean;
  repeatCount: number;
};

export type BoardBonusConfig = {
  rows: number;
  cols: number;
  bonusHorizontal: number;
  bonusVertical: number;
  bonusDiagonal: number;
  bonusBlackout: number;
};

export type ScoreBreakdown = {
  tilePoints: number;
  repeatBonusPoints: number;
  lineBonusPoints: number;
  blackoutBonusPoints: number;
  total: number;
  completedCount: number;
};

export function computeScore(board: BoardBonusConfig, tiles: ScoredTile[]): ScoreBreakdown {
  const grid: (ScoredTile | undefined)[][] = Array.from({ length: board.rows }, () =>
    Array.from({ length: board.cols }, () => undefined as ScoredTile | undefined)
  );
  for (const tile of tiles) grid[tile.row][tile.col] = tile;

  const tilePoints = tiles.filter((t) => t.completed).reduce((sum, t) => sum + t.points, 0);
  const repeatBonusPoints = tiles.reduce(
    (sum, t) => sum + (t.bonusPerRepeat ?? 0) * t.repeatCount,
    0
  );

  let lineBonusPoints = 0;
  for (let r = 0; r < board.rows; r++) {
    if (grid[r].every((t) => t?.completed)) lineBonusPoints += board.bonusHorizontal;
  }
  for (let c = 0; c < board.cols; c++) {
    if (grid.every((row) => row[c]?.completed)) lineBonusPoints += board.bonusVertical;
  }
  if (board.rows === board.cols) {
    const n = board.rows;
    const mainDiagonal = Array.from({ length: n }, (_, i) => grid[i][i]);
    if (mainDiagonal.every((t) => t?.completed)) lineBonusPoints += board.bonusDiagonal;
    const antiDiagonal = Array.from({ length: n }, (_, i) => grid[i][n - 1 - i]);
    if (antiDiagonal.every((t) => t?.completed)) lineBonusPoints += board.bonusDiagonal;
  }

  const completedCount = tiles.filter((t) => t.completed).length;
  const blackoutBonusPoints = tiles.length > 0 && completedCount === tiles.length ? board.bonusBlackout : 0;

  const total = tilePoints + repeatBonusPoints + lineBonusPoints + blackoutBonusPoints;
  return { tilePoints, repeatBonusPoints, lineBonusPoints, blackoutBonusPoints, total, completedCount };
}
