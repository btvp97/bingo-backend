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

test("AND_OR mode completes only once every group has a satisfied condition", () => {
  const criteria: TileCriteria = {
    metric: "ITEM_OBTAINED",
    mode: "AND_OR",
    target: 1, // unused placeholder for this mode
    sources: [], // unused placeholder for this mode
    repeatable: false,
    groups: [
      { conditions: [{ source: "Bones", target: 1 }, { source: "Big bones", target: 1 }] },
      { conditions: [{ source: "Ashes", target: 1 }, { source: "Chef's hat", target: 1 }] },
    ],
  };
  let progress = emptyProgress();

  // First group satisfied via Big bones; second group still has nothing.
  let result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Big bones", amount: 1 });
  assert.equal(result.justCompleted, false);
  progress = result.progress;

  // Ashes satisfies the second group; the first is already satisfied via Big
  // bones, so the tile completes now that every group has a met condition.
  result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Ashes", amount: 1 });
  assert.equal(result.justCompleted, true);
});

test("AND_OR mode: three groups of three options each, matching (A or B or C) and (D or E or F) and (G or H or I)", () => {
  const criteria: TileCriteria = {
    metric: "ITEM_OBTAINED",
    mode: "AND_OR",
    target: 1,
    sources: [],
    repeatable: false,
    groups: [
      { conditions: [{ source: "A", target: 1 }, { source: "B", target: 1 }, { source: "C", target: 1 }] },
      { conditions: [{ source: "D", target: 1 }, { source: "E", target: 1 }, { source: "F", target: 1 }] },
      { conditions: [{ source: "G", target: 1 }, { source: "H", target: 1 }, { source: "I", target: 1 }] },
    ],
  };
  let progress = emptyProgress();

  let result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "B", amount: 1 });
  assert.equal(result.justCompleted, false);
  progress = result.progress;

  result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "F", amount: 1 });
  assert.equal(result.justCompleted, false);
  progress = result.progress;

  // Third group not yet satisfied until this event.
  result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "H", amount: 1 });
  assert.equal(result.justCompleted, true);
});

test("AND_OR mode: a condition can require more than 1", () => {
  const criteria: TileCriteria = {
    metric: "ITEM_OBTAINED",
    mode: "AND_OR",
    target: 1,
    sources: [],
    repeatable: false,
    groups: [{ conditions: [{ source: "Bones", target: 3 }, { source: "Big bones", target: 1 }] }],
  };
  let progress = emptyProgress();

  let result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Bones", amount: 2 });
  assert.equal(result.justCompleted, false); // needs 3 Bones, only has 2
  progress = result.progress;

  result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Bones", amount: 1 });
  assert.equal(result.justCompleted, true);
});

test("AND_OR mode with no groups never completes (data-error guard, not vacuously true)", () => {
  const criteria: TileCriteria = {
    metric: "ITEM_OBTAINED",
    mode: "AND_OR",
    target: 1,
    sources: ["Bones"],
    repeatable: false,
    groups: [],
  };
  const progress = emptyProgress();
  // Bones isn't in any group's conditions (there are no groups), so this is
  // rejected as "not on this tile" rather than completing anything.
  const result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Bones", amount: 1 });
  assert.equal(result.rejected, "source not on this tile");
});

test("OR_AND mode completes once any one full set is satisfied", () => {
  const criteria: TileCriteria = {
    metric: "ITEM_OBTAINED",
    mode: "OR_AND",
    target: 1, // unused placeholder for this mode
    sources: [], // unused placeholder for this mode
    repeatable: false,
    sets: [
      { conditions: [{ source: "Blood Moon helm", target: 1 }, { source: "Blood Moon chestplate", target: 1 }, { source: "Blood Moon tassets", target: 1 }] },
      { conditions: [{ source: "Blue Moon helm", target: 1 }, { source: "Blue Moon chestplate", target: 1 }, { source: "Blue Moon tassets", target: 1 }] },
      { conditions: [{ source: "Eclipse Moon helm", target: 1 }, { source: "Eclipse Moon chestplate", target: 1 }, { source: "Eclipse Moon tassets", target: 1 }] },
    ],
  };
  let progress = emptyProgress();

  let result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Blood Moon helm", amount: 1 });
  assert.equal(result.justCompleted, false);
  progress = result.progress;

  result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Blood Moon chestplate", amount: 1 });
  assert.equal(result.justCompleted, false);
  progress = result.progress;

  result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Blood Moon tassets", amount: 1 });
  assert.equal(result.justCompleted, true);
});

test("OR_AND mode does NOT complete on mismatched pieces from different sets (the case AND_OR gets wrong)", () => {
  const criteria: TileCriteria = {
    metric: "ITEM_OBTAINED",
    mode: "OR_AND",
    target: 1,
    sources: [],
    repeatable: false,
    sets: [
      { conditions: [{ source: "Blood Moon helm", target: 1 }, { source: "Blood Moon chestplate", target: 1 }, { source: "Blood Moon tassets", target: 1 }] },
      { conditions: [{ source: "Blue Moon helm", target: 1 }, { source: "Blue Moon chestplate", target: 1 }, { source: "Blue Moon tassets", target: 1 }] },
      { conditions: [{ source: "Eclipse Moon helm", target: 1 }, { source: "Eclipse Moon chestplate", target: 1 }, { source: "Eclipse Moon tassets", target: 1 }] },
    ],
  };
  let progress = emptyProgress();

  // One piece from each of the three different sets — no single set is complete.
  let result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Blood Moon helm", amount: 1 });
  progress = result.progress;
  result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Blue Moon chestplate", amount: 1 });
  progress = result.progress;
  result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Eclipse Moon tassets", amount: 1 });
  assert.equal(result.justCompleted, false);

  // Finishing off the Blood Moon set specifically is what actually completes it.
  progress = result.progress;
  result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Blood Moon chestplate", amount: 1 });
  assert.equal(result.justCompleted, false);
  progress = result.progress;
  result = applyCompletionEvent(criteria, progress, { metric: "ITEM_OBTAINED", source: "Blood Moon tassets", amount: 1 });
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
