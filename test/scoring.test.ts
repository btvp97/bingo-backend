import assert from "node:assert/strict";
import { test } from "node:test";
import { computeScore } from "../src/scoring.js";

test("sums tile points and awards a line bonus for a completed row", () => {
  const board = { rows: 2, cols: 2, bonusHorizontal: 5, bonusVertical: 5, bonusDiagonal: 10, bonusBlackout: 20 };
  const tiles = [
    { row: 0, col: 0, points: 1, bonusPerRepeat: null, completed: true, repeatCount: 0 },
    { row: 0, col: 1, points: 1, bonusPerRepeat: null, completed: true, repeatCount: 0 },
    { row: 1, col: 0, points: 1, bonusPerRepeat: null, completed: false, repeatCount: 0 },
    { row: 1, col: 1, points: 1, bonusPerRepeat: null, completed: false, repeatCount: 0 },
  ];
  const score = computeScore(board, tiles);
  assert.equal(score.tilePoints, 2);
  assert.equal(score.lineBonusPoints, 5); // top row complete -> horizontal bonus only
  assert.equal(score.blackoutBonusPoints, 0);
  assert.equal(score.total, 7);
});

test("awards blackout bonus only when every tile is complete", () => {
  const board = { rows: 1, cols: 2, bonusHorizontal: 0, bonusVertical: 0, bonusDiagonal: 0, bonusBlackout: 20 };
  const tiles = [
    { row: 0, col: 0, points: 1, bonusPerRepeat: null, completed: true, repeatCount: 0 },
    { row: 0, col: 1, points: 1, bonusPerRepeat: null, completed: true, repeatCount: 0 },
  ];
  const score = computeScore(board, tiles);
  assert.equal(score.blackoutBonusPoints, 20);
});

test("repeat bonus points accumulate uncapped", () => {
  const board = { rows: 1, cols: 1, bonusHorizontal: 0, bonusVertical: 0, bonusDiagonal: 0, bonusBlackout: 0 };
  const tiles = [{ row: 0, col: 0, points: 3, bonusPerRepeat: 3, completed: true, repeatCount: 4 }];
  const score = computeScore(board, tiles);
  assert.equal(score.repeatBonusPoints, 12);
  assert.equal(score.total, 15);
});

test("diagonal bonus only applies on square boards", () => {
  const board = { rows: 2, cols: 3, bonusHorizontal: 0, bonusVertical: 0, bonusDiagonal: 10, bonusBlackout: 0 };
  const tiles = [
    { row: 0, col: 0, points: 0, bonusPerRepeat: null, completed: true, repeatCount: 0 },
    { row: 1, col: 1, points: 0, bonusPerRepeat: null, completed: true, repeatCount: 0 },
  ];
  const score = computeScore(board, tiles);
  assert.equal(score.lineBonusPoints, 0);
});
