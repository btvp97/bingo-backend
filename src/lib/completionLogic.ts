// Pure state-transition logic for "did this event complete a tile?" — no
// Express, no Prisma, no I/O. Kept isolated like this so it can be unit
// tested directly (see test/completionLogic.test.ts) without a database.
//
// This implements the rules from tile-criteria-schema.md:
//   - mode "sum":  every matching event adds to one running total; tile
//                  completes when the total reaches target.
//   - mode "each": every source in the list needs its own count to reach
//                  target (usually 1); tile completes when all sources do.
//                  A source can override that shared target via
//                  criteria.sourceTargets (e.g. {"Goblin": 2, "Chicken": 3});
//                  any source missing from that map falls back to `target`.
//   - mode "and_or": nested boolean logic. criteria.groups is a list of
//                  OR-groups, each a list of {source, target} conditions;
//                  the tile completes only when EVERY group has at least one
//                  satisfied condition — AND across groups, OR within a
//                  group, e.g. (Bones OR Big bones) AND (Ashes OR Chef's
//                  hat). Reuses the same eachProgress {source: count} map
//                  EACH mode uses; target/sources/sourceTargets are unused
//                  placeholders for this mode.
//   - repeatable:  once complete, further matching events don't re-complete
//                  the tile — they add to repeatCount instead, which the
//                  caller turns into bonus points via bonusPerRepeat.

export type Metric = "KILL_COUNT" | "ITEM_OBTAINED" | "ACTIVITY_COMPLETION";
export type Mode = "SUM" | "EACH" | "AND_OR";

export type AndOrCondition = { source: string; target: number };
export type AndOrGroup = { conditions: AndOrCondition[] };

export type TileCriteria = {
  metric: Metric;
  mode: Mode;
  target: number;
  sources: string[];
  repeatable: boolean;
  // EACH mode only — per-source override of `target`. A source not present
  // here (or this being undefined entirely) uses `target` as usual.
  sourceTargets?: Record<string, number>;
  // AND_OR mode only — see the note above. Required (non-empty) for that mode.
  groups?: AndOrGroup[];
};

export type ProgressState = {
  sumProgress: number;
  eachProgress: Record<string, number>;
  repeatCount: number;
  completedAt: Date | null;
};

export type CompletionInput = {
  metric: Metric;
  source: string;
  amount: number;
};

export type CompletionResult = {
  progress: ProgressState;
  justCompleted: boolean; // tile crossed from incomplete to complete on this event
  repeatCredited: boolean; // an extra repeat credit was granted on this event
  rejected?: string; // set instead of applying anything, if the event doesn't match
};

export function emptyProgress(): ProgressState {
  return { sumProgress: 0, eachProgress: {}, repeatCount: 0, completedAt: null };
}

export function applyCompletionEvent(
  criteria: TileCriteria,
  progress: ProgressState,
  input: CompletionInput,
  now: Date = new Date()
): CompletionResult {
  if (input.metric !== criteria.metric) {
    return { progress, justCompleted: false, repeatCredited: false, rejected: "metric mismatch" };
  }

  const candidateSources =
    criteria.mode === "AND_OR"
      ? (criteria.groups ?? []).flatMap((g) => g.conditions.map((c) => c.source))
      : criteria.sources;

  const canonicalSource = candidateSources.find(
    (s) => s.toLowerCase() === input.source.toLowerCase()
  );
  if (!canonicalSource) {
    return { progress, justCompleted: false, repeatCredited: false, rejected: "source not on this tile" };
  }

  if (progress.completedAt) {
    if (!criteria.repeatable) {
      return { progress, justCompleted: false, repeatCredited: false, rejected: "already completed" };
    }
    // Already done, and this tile grants bonus credit for repeats.
    const updated: ProgressState = { ...progress, repeatCount: progress.repeatCount + 1 };
    return { progress: updated, justCompleted: false, repeatCredited: true };
  }

  if (criteria.mode === "SUM") {
    const sumProgress = progress.sumProgress + input.amount;
    const completed = sumProgress >= criteria.target;
    const updated: ProgressState = {
      ...progress,
      sumProgress,
      completedAt: completed ? now : null,
    };
    return { progress: updated, justCompleted: completed, repeatCredited: false };
  }

  if (criteria.mode === "EACH") {
    const eachProgress = { ...progress.eachProgress };
    eachProgress[canonicalSource] = (eachProgress[canonicalSource] ?? 0) + input.amount;
    const allDone = criteria.sources.every((s) => (eachProgress[s] ?? 0) >= targetFor(criteria, s));
    const updated: ProgressState = {
      ...progress,
      eachProgress,
      completedAt: allDone ? now : null,
    };
    return { progress: updated, justCompleted: allDone, repeatCredited: false };
  }

  // mode === "AND_OR"
  const eachProgress = { ...progress.eachProgress };
  eachProgress[canonicalSource] = (eachProgress[canonicalSource] ?? 0) + input.amount;
  // A tile with no groups defined is a data error, not a trivially-satisfied
  // tile — .every() on an empty array is vacuously true, so guard against it
  // explicitly rather than let a misconfigured tile silently auto-complete.
  const allGroupsSatisfied =
    (criteria.groups ?? []).length > 0 &&
    criteria.groups!.every((group) => group.conditions.some((c) => (eachProgress[c.source] ?? 0) >= c.target));
  const updated: ProgressState = {
    ...progress,
    eachProgress,
    completedAt: allGroupsSatisfied ? now : null,
  };
  return { progress: updated, justCompleted: allGroupsSatisfied, repeatCredited: false };
}

// The target a given EACH-mode source needs to hit: its own override from
// criteria.sourceTargets if one exists (matched case-insensitively, same as
// source matching elsewhere in this file), otherwise the tile's shared
// `target`.
function targetFor(criteria: TileCriteria, source: string): number {
  if (!criteria.sourceTargets) {
    return criteria.target;
  }
  const key = Object.keys(criteria.sourceTargets).find((k) => k.toLowerCase() === source.toLowerCase());
  return key !== undefined ? criteria.sourceTargets[key] : criteria.target;
}
