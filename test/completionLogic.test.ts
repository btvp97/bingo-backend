import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCompletionEvent, emptyProgress, type TileCriteria } from "../src/lib/completionLogic.js";

test("SUM mode accumulates and completes at target", () => {
  const criteria: TileCriteria = { metric: "KILL_COUNT", mode: "SUM", target: 3, sources: ["Zulrah"], repeatable: false };
  let progress = emptyProgress();

  let result = applyCompletionEvent(criteria, progress, { metric: "KILL_COUNT", source: "Zulrah", amount: 1 });
  assert.equal(result.progress.sumProgress, 1);
  assert.equal(result.justCompleted, false);
  progress = result.progress;

  // source matching is case-insensitive, since chat text casing can vary
  result = applyCompletionEvent(criteria, progress, { metric: "KILL_COUNT", source: "zulrah", amount: 2 });
  assert.equal(result.progress.sumProgress, 3);
  assert.equal(result.justCompleted, true);
  assert.ok(result.progress.completedAt);
});

test("EACH mode requires every source before completing", () => {
  const criteria: TileCriteria = {
    metric: "ITEM_OBTAINED",
    mode: "EACH",
    target: 1,
    sources: ["Berserker ring", "Archer ring", "Warrior ring"],
    repeatable: false,
  };
  let progress = emptyProgress();

  let result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Berserker ring", amount: 1 });
  assert.equal(result.justCompleted, false);
  progress = result.progress;

  result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Archer ring", amount: 1 });
  assert.equal(result.justCompleted, false);
  progress = result.progress;

  result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Warrior ring", amount: 1 });
  assert.equal(result.justCompleted, true);
});

test("EACH mode with sourceTargets requires each source's own target, not a shared one", () => {
  const criteria: TileCriteria = {
    metric: "KILL_COUNT",
    mode: "EACH",
    target: 1, // unused fallback here since sourceTargets covers every source
    sources: ["Goblin", "Chicken"],
    sourceTargets: { Goblin: 2, Chicken: 3 },
    repeatable: false,
  };
  let progress = emptyProgress();

  // One Goblin kill — Goblin needs 2, not done yet.
  let result = applyCompletionEvent(criteria, progress, { metric: "KILL_COUNT", source: "Goblin", amount: 1 });
  assert.equal(result.justCompleted, false);
  progress = result.progress;

  // Second Goblin kill hits its target, but Chicken (needs 3) has zero — still not done.
  result = applyCompletionEvent(criteria, progress, { metric: "KILL_COUNT", source: "Goblin", amount: 1 });
  assert.equal(result.justCompleted, false);
  assert.equal(result.progress.eachProgress["Goblin"], 2);
  progress = result.progress;

  // Two Chickens — still short of its own target of 3.
  result = applyCompletionEvent(criteria, progress, { metric: "KILL_COUNT", source: "Chicken", amount: 2 });
  assert.equal(result.justCompleted, false);
  progress = result.progress;

  // Third Chicken completes the tile, since Goblin already met its own target.
  result = applyCompletionEvent(criteria, progress, { metric: "KILL_COUNT", source: "Chicken", amount: 1 });
  assert.equal(result.justCompleted, true);
});

test("EACH mode falls back to shared target for a source missing from sourceTargets", () => {
  const criteria: TileCriteria = {
    metric: "KILL_COUNT",
    mode: "EACH",
    target: 2,
    sources: ["Goblin", "Chicken"],
    sourceTargets: { Goblin: 2 }, // Chicken isn't listed, so it falls back to target=2
    repeatable: false,
  };
  let progress = emptyProgress();

  let result = applyCompletionEvent(criteria, progress, { metric: "KILL_COUNT", source: "Goblin", amount: 2 });
  progress = result.progress;
  result = applyCompletionEvent(criteria, progress, { metric: "KILL_COUNT", source: "Chicken", amount: 1 });
  assert.equal(result.justCompleted, false); // Chicken needs the fallback target of 2, only has 1
  progress = result.progress;

  result = applyCompletionEvent(criteria, progress, { metric: "KILL_COUNT", source: "Chicken", amount: 1 });
  assert.equal(result.justCompleted, true);
});

test("repeatable tile grants bonus credit after completion instead of re-completing", () => {
  const criteria: TileCriteria = {
    metric: "ACTIVITY_COMPLETION",
    mode: "SUM",
    target: 1,
    sources: ["Pet received"],
    repeatable: true,
  };
  let progress = emptyProgress();

  let result = applyCompletionEvent(criteria, progress, { metric: "ACTIVITY_COMPLETION", source: "Pet received", amount: 1 });
  assert.equal(result.justCompleted, true);
  assert.equal(result.repeatCredited, false);
  progress = result.progress;

  result = applyCompletionEvent(criteria, progress, { metric: "ACTIVITY_COMPLETION", source: "Pet received", amount: 1 });
  assert.equal(result.justCompleted, false);
  assert.equal(result.repeatCredited, true);
  assert.equal(result.progress.repeatCount, 1);

  progress = result.progress;
  result = applyCompletionEvent(criteria, progress, { metric: "ACTIVITY_COMPLETION", source: "Pet received", amount: 1 });
  assert.equal(result.progress.repeatCount, 2);
});

test("non-repeatable tile rejects events after completion", () => {
  const criteria: TileCriteria = { metric: "KILL_COUNT", mode: "SUM", target: 1, sources: ["Demonic Brutus"], repeatable: false };
  let progress = emptyProgress();
  let result = applyCompletionEvent(criteria, progress, { metric: "KILL_COUNT", source: "Demonic Brutus", amount: 1 });
  assert.equal(result.justCompleted, true);
  progress = result.progress;

  result = applyCompletionEvent(criteria, progress, { metric: "KILL_COUNT", source: "Demonic Brutus", amount: 1 });
  assert.equal(result.rejected, "already completed");
});

test("rejects events for a source that isn't on the tile", () => {
  const criteria: TileCriteria = { metric: "KILL_COUNT", mode: "SUM", target: 5, sources: ["Yama"], repeatable: false };
  const progress = emptyProgress();
  const result = applyCompletionEvent(criteria, progress, { metric: "KILL_COUNT", source: "The Nightmare", amount: 1 });
  assert.equal(result.rejected, "source not on this tile");
  assert.equal(result.progress.sumProgress, 0);
});

test("rejects events with the wrong metric even if the source name matches", () => {
  const criteria: TileCriteria = { metric: "KILL_COUNT", mode: "SUM", target: 5, sources: ["Yama"], repeatable: false };
  const progress = emptyProgress();
  const result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Yama", amount: 1 });
  assert.equal(result.rejected, "metric mismatch");
});
