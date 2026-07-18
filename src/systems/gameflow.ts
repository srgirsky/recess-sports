// ---------------------------------------------------------------------------
// Game-level sequencing. PURE. inning.ts is the half-inning machine; this file
// decides what happens BETWEEN halves: skip a pointless bottom, end on a
// walk-off, or grant one bonus inning on a tie. The player always bats the top
// (away team); the CPU is the home team batting the bottom.
// ---------------------------------------------------------------------------

/**
 * True: don't play the bottom half at all — the home team already leads after
 * the top of the final (or an extra) inning, so their at-bats are pointless.
 */
export function shouldSkipBottom(
  inning: number,
  regulation: number,
  homeScore: number,
  awayScore: number
): boolean {
  return inning >= regulation && homeScore > awayScore;
}

/**
 * True: end the game right now, mid-half — the home team just took the lead
 * in the bottom of the final (or an extra) inning. A walk-off!
 */
export function isWalkOff(
  inning: number,
  regulation: number,
  half: 'top' | 'bottom',
  homeScore: number,
  awayScore: number
): boolean {
  return half === 'bottom' && inning >= regulation && homeScore > awayScore;
}

export type AfterHalf =
  | { done: true; tie: boolean }
  | { done: false; inning: number; half: 'top' | 'bottom'; extra: boolean };

/**
 * Decide what follows a completed half-inning. A tie after regulation earns up
 * to `maxExtra` bonus innings; still tied after that, the tie stands.
 * `extra: true` flags the start of a bonus inning (for a "BONUS INNING!" call).
 */
export function decideAfterHalf(
  inning: number,
  half: 'top' | 'bottom',
  regulation: number,
  awayScore: number,
  homeScore: number,
  maxExtra: number
): AfterHalf {
  if (half === 'top') {
    return { done: false, inning, half: 'bottom', extra: false };
  }
  // Bottom just ended: the inning is complete.
  if (inning < regulation) {
    return { done: false, inning: inning + 1, half: 'top', extra: false };
  }
  if (homeScore !== awayScore) {
    return { done: true, tie: false };
  }
  if (inning < regulation + maxExtra) {
    return { done: false, inning: inning + 1, half: 'top', extra: true };
  }
  return { done: true, tie: true };
}
