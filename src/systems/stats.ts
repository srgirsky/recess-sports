// ---------------------------------------------------------------------------
// Per-kid accumulating stats — PURE. The scene emits plain StatEvents at the
// moments it already knows about (at-bat settles, live-play scores, thrown
// strikeouts) and foldStats reduces them into each kid's line. The Recess
// Week season persists the folded record; awards read it at week's end.
// ---------------------------------------------------------------------------

export interface KidStats {
  /** Official at-bats (walks don't count). */
  ab: number;
  /** Hits (any time the batter reaches on contact — playground scoring). */
  h: number;
  /** Home runs (also counted in h). */
  hr: number;
  /** Runs scored. */
  r: number;
  /** Strikeouts THROWN (as the pitcher). */
  k: number;
}

export type StatEvent =
  | { t: 'atBat'; kid: string } // an official AB completed
  | { t: 'hit'; kid: string; homer?: boolean }
  | { t: 'run'; kid: string }
  | { t: 'kThrown'; kid: string };

export const EMPTY_LINE: KidStats = { ab: 0, h: 0, hr: 0, r: 0, k: 0 };

/** Fold events into a stats record (returns a new record; inputs untouched). */
export function foldStats(
  base: Record<string, KidStats>,
  events: StatEvent[]
): Record<string, KidStats> {
  const out: Record<string, KidStats> = {};
  for (const [id, line] of Object.entries(base)) out[id] = { ...line };
  const line = (id: string) => (out[id] ??= { ...EMPTY_LINE });
  for (const e of events) {
    switch (e.t) {
      case 'atBat':
        line(e.kid).ab += 1;
        break;
      case 'hit': {
        const l = line(e.kid);
        l.h += 1;
        if (e.homer) l.hr += 1;
        break;
      }
      case 'run':
        line(e.kid).r += 1;
        break;
      case 'kThrown':
        line(e.kid).k += 1;
        break;
    }
  }
  return out;
}

/** Kid-readable batting line: "2-for-4, 1 HR". */
export function statLine(s: KidStats): string {
  const parts = [`${s.h}-for-${s.ab}`];
  if (s.hr > 0) parts.push(`${s.hr} HR`);
  if (s.r > 0) parts.push(`${s.r} R`);
  if (s.k > 0) parts.push(`${s.k} K`);
  return parts.join(' · ');
}
