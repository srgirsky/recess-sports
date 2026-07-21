// ---------------------------------------------------------------------------
// Recess Week — the 5-game season. PURE state + localStorage persistence
// (picklog pattern, versioned from day one). One draft is kept all week; each
// weekday brings a preset rival; per-kid stats accumulate across the games;
// win 3+ to take the pennant. The scenes read/write through here only.
// ---------------------------------------------------------------------------

import { SEASON } from '../config';
import { RIVAL_PRESETS, type TeamIdentity } from './team';
import { foldStats, type KidStats, type StatEvent } from './stats';

export type GameResult = 'W' | 'L' | 'T';

export interface SeasonState {
  v: number;
  /** 0..GAMES — the NEXT game to play; >= GAMES means the week is done. */
  gameIndex: number;
  results: GameResult[];
  /** The drafted 9, kept all week (batting-order edits happen per game). */
  playerTeam: string[];
  identity: TeamIdentity;
  /** One rival identity + roster per weekday. */
  rivals: TeamIdentity[];
  rivalTeams: string[][];
  stats: Record<string, KidStats>;
}

const KEY = 'recess_season';
const VERSION = 1;

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

/**
 * Start a fresh week: rivals rotate through the presets (skipping the
 * player's own color) and each fields a 9 drawn from the rest of the roster.
 * `rng` is injected so tests stay deterministic.
 */
export function newSeason(
  playerTeam: string[],
  identity: TeamIdentity,
  benchIds: string[],
  rng: () => number
): SeasonState {
  const pool = benchIds.filter((id) => !playerTeam.includes(id));
  const rivals: TeamIdentity[] = [];
  const rivalTeams: string[][] = [];
  const presets = RIVAL_PRESETS.filter((r) => r.color !== identity.color);
  for (let g = 0; g < SEASON.GAMES; g++) {
    rivals.push(presets[g % presets.length]);
    // A fresh shuffle of the bench for each rival (kids play for many teams
    // in one recess week — that's playground-accurate).
    const deck = [...pool];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    rivalTeams.push(deck.slice(0, playerTeam.length));
  }
  return {
    v: VERSION,
    gameIndex: 0,
    results: [],
    playerTeam,
    identity,
    rivals,
    rivalTeams,
    stats: {},
  };
}

/** Fold one finished game into the week. */
export function recordSeasonGame(
  s: SeasonState,
  result: GameResult,
  events: StatEvent[]
): SeasonState {
  return {
    ...s,
    gameIndex: s.gameIndex + 1,
    results: [...s.results, result],
    stats: foldStats(s.stats, events),
  };
}

export function wins(s: SeasonState): number {
  return s.results.filter((r) => r === 'W').length;
}

export function isWeekOver(s: SeasonState): boolean {
  return s.gameIndex >= SEASON.GAMES;
}

export function wonPennant(s: SeasonState): boolean {
  return wins(s) >= SEASON.PENNANT_WINS;
}

// --- Persistence ------------------------------------------------------------

export function getSeason(): SeasonState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as SeasonState;
    if (p.v !== VERSION || !Array.isArray(p.playerTeam) || p.playerTeam.length === 0) return null;
    return p;
  } catch {
    return null;
  }
}

export function saveSeason(s: SeasonState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* non-persistent is fine */
  }
}

export function clearSeason(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* fine */
  }
}
