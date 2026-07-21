// ---------------------------------------------------------------------------
// End-of-week awards — PURE, computed from the season's accumulated stats
// (NOT the Result screen's stat-sum MVP, which stays for exhibitions).
// Deterministic: ties break by roster order of the ids given.
// ---------------------------------------------------------------------------

import type { KidStats } from './stats';

export interface SeasonAwards {
  /** Best all-week bat: hits + 2×HR + runs. */
  mvp: string | null;
  /** Most home runs (needs at least one). */
  homerKing: string | null;
  /** Most strikeouts thrown (needs at least one). */
  strikeoutKing: string | null;
}

export function computeAwards(stats: Record<string, KidStats>, order: string[]): SeasonAwards {
  const ids = order.filter((id) => stats[id]);
  const best = (score: (s: KidStats) => number, min = 1): string | null => {
    let top: string | null = null;
    let topScore = min - 1;
    for (const id of ids) {
      const v = score(stats[id]);
      if (v > topScore) {
        topScore = v;
        top = id;
      }
    }
    return top;
  };
  return {
    mvp: best((s) => s.h + s.hr * 2 + s.r),
    homerKing: best((s) => s.hr),
    strikeoutKing: best((s) => s.k),
  };
}
