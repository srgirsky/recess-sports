// ---------------------------------------------------------------------------
// The "voting machine." Every time a PLAYER drafts a kid, we tally it in
// localStorage. Pick rates are the whole point of the product: they tell us
// which characters kids actually love, i.e. which ones become toys and shows.
//
// AI picks are intentionally NOT counted — we only want human preference.
// This is per-browser for now; a real cross-player backend comes later.
// ---------------------------------------------------------------------------

import { ROSTER } from '../data/characters';

const COUNTS_KEY = 'recess_pickcounts';
const GAMES_KEY = 'recess_games_played';

/**
 * ★ THE TALLY IS KEYED BY SLOT ID, AND THE SLOTS WERE RE-CAST (2026-11). A vote
 * for the kid who held `big_lou` before is not a vote for the kid who holds it
 * now, so the counts carry the name of the cast they were cast for. A stored
 * tally for another cast — or the bare `{id: n}` object every tally was before
 * this — is discarded on first read, games-played with it, so the two numbers
 * that make a pick RATE always describe the same games. The keys themselves do
 * not change: they are shared with v2 on purpose and the root brief names them.
 */
const CAST = 'world1';

type Counts = Record<string, number>;
interface Tally {
  cast: string;
  counts: Counts;
}

function parseTally(raw: string | null): Tally | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.cast !== 'string' || !parsed.counts || typeof parsed.counts !== 'object') return null;
    return parsed as Tally;
  } catch {
    return null;
  }
}

function readCounts(): Counts {
  try {
    const tally = parseTally(localStorage.getItem(COUNTS_KEY));
    if (tally?.cast === CAST) return tally.counts;
    if (localStorage.getItem(COUNTS_KEY) !== null) {
      // Another cast's votes (or the pre-cast shape). Start the machine over.
      localStorage.removeItem(COUNTS_KEY);
      localStorage.removeItem(GAMES_KEY);
    }
    return {};
  } catch {
    // Private mode / storage disabled — degrade gracefully.
    return {};
  }
}

function writeCounts(counts: Counts): void {
  try {
    localStorage.setItem(COUNTS_KEY, JSON.stringify({ cast: CAST, counts } satisfies Tally));
  } catch {
    /* ignore — the game still works, we just can't persist votes */
  }
}

/** Record a single player pick. Call once per kid the human drafts. */
export function recordPick(characterId: string): void {
  const counts = readCounts();
  counts[characterId] = (counts[characterId] ?? 0) + 1;
  writeCounts(counts);
}

/** Bump the games-played counter (used as a denominator for pick rate). */
export function recordGamePlayed(): void {
  try {
    const n = parseInt(localStorage.getItem(GAMES_KEY) ?? '0', 10) || 0;
    localStorage.setItem(GAMES_KEY, String(n + 1));
  } catch {
    /* ignore */
  }
}

export function getGamesPlayed(): number {
  try {
    return parseInt(localStorage.getItem(GAMES_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

export interface PickRate {
  id: string;
  name: string;
  count: number;
  /** Share of total picks, 0-1. */
  rate: number;
}

/** Every character, ranked most-drafted first. Zero-pick kids included at the bottom. */
export function readPickRates(): PickRate[] {
  const counts = readCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return ROSTER.map((c) => {
    const count = counts[c.id] ?? 0;
    return { id: c.id, name: c.name, count, rate: total ? count / total : 0 };
  }).sort((a, b) => b.count - a.count);
}

/** Wipe the tally (handy from the dev overlay while testing). */
export function resetPicks(): void {
  try {
    localStorage.removeItem(COUNTS_KEY);
    localStorage.removeItem(GAMES_KEY);
  } catch {
    /* ignore */
  }
}
