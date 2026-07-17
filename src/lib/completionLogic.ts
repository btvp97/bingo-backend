// Pure state-transition logic for "did this event complete a tile?" — no
// Express, no Prisma, no I/O. Kept isolated like this so it can be unit
// tested directly (see test/completionLogic.test.ts) without a database.
//
// This implements the rules from tile-criteria-schema.md:
//   - mode "sum":  every matching event adds to one running total; tile
//                  completes when the total reaches target.
//   - mode "each": every source in the list needs its own count to reach
//                  target (usually 1); tile completes when all sources do.
//   - repeatable:  once complete, further matching events don't re-complete
//                  the tile — they add to repeatCount instead, which the
//                  caller turns into bonus points via bonusPerRepeat.

export type Metric = "KILL_COUNT" | "ITEM_OBTAINED" | "ACTIVITY_COMPLETION";
export type Mode = "SUM" | "EACH";

export type TileCriteria = {
  metric: Metric;
  mode: Mode;
  target: number;
  sources: string[];
  repeatable: boolean;
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

  const canonicalSource = criteria.sources.find(
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

  // mode === "EACH"
  const eachProgress = { ...progress.eachProgress };
  eachProgress[canonicalSource] = (eachProgress[canonicalSource] ?? 0) + input.amount;
  const allDone = criteria.sources.every((s) => (eachProgress[s] ?? 0) >= criteria.target);
  const updated: ProgressState = {
    ...progress,
    eachProgress,
    completedAt: allDone ? now : null,
  };
  return { progress: updated, justCompleted: allDone, repeatCredited: false };
}
