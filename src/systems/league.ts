// ---------------------------------------------------------------------------
// The Recess Week LEAGUE — PURE, v1 only. BB2001's season is a league: every
// team plays, there's a standings table, and the top of it meets in a
// championship game. Recess Week was five games against five rivals and a
// pennant for three wins; this adds the rest of the league around it.
//
// Six teams — you (index -1) and the five weekday rivals (0..4) — play a true
// round robin over the five weekdays: on day d you play rival d, and the
// other four rivals pair off so that every two teams meet exactly once.
//
// ★ Nothing here is stored. The rival-vs-rival games are DERIVED from the
// rosters already saved in `recess_season` through a seed hashed from them,
// so the same week always produces the same league, and a week that v2
// advanced (it shares the key and knows nothing of leagues) still has one.
// Only the championship's own result is saved (`SeasonState.final`).
// ---------------------------------------------------------------------------

import { getCharacter } from '../data/characters';
import { SEASON } from '../config';
import type { GameResult, SeasonState } from './season';

/** -1 = the player's team; 0..4 = the rival who visits on that weekday. */
export type TeamIdx = number;
export const YOU: TeamIdx = -1;

export interface LeagueGame {
  day: number;
  home: TeamIdx;
  away: TeamIdx;
  /** Rival-vs-rival only (the player's games come from `results`). */
  winner: TeamIdx;
}

export interface StandingsRow {
  team: TeamIdx;
  w: number;
  l: number;
  t: number;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Day d's two rival-vs-rival pairings (the circle method around fixed you). */
export function rivalPairs(day: number): Array<[number, number]> {
  const n = SEASON.GAMES; // 5 rivals
  return [1, 2].map((k) => [mod(day + k, n), mod(day - k, n)] as [number, number]);
}

/** A stable 32-bit seed from the saved rosters — the same week, the same league. */
export function leagueSeed(s: SeasonState): number {
  const text = [s.playerTeam.join(','), ...s.rivalTeams.map((t) => t.join(','))].join('|');
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** One deterministic draw in [0,1) per (seed, day, pairing). */
function draw(seed: number, day: number, a: number, b: number): number {
  let x = (seed ^ Math.imul(day + 1, 0x9e3779b1) ^ Math.imul(a + 7, 0x85ebca6b) ^ Math.imul(b + 13, 0xc2b2ae35)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** How good a nine is: the mean of every kid's four ratings. */
export function teamStrength(ids: string[]): number {
  if (ids.length === 0) return 0;
  let sum = 0;
  for (const id of ids) {
    const s = getCharacter(id).stats;
    sum += s.contact + s.power + s.speed + s.pitching;
  }
  return sum / ids.length;
}

/** Chance the stronger side wins swings with the gap, but upsets stay common. */
function winChance(a: number, b: number): number {
  return Math.min(0.8, Math.max(0.2, 0.5 + (a - b) * 0.03));
}

/** Every rival-vs-rival game from the first `days` weekdays. */
export function rivalGames(s: SeasonState, days: number): LeagueGame[] {
  const seed = leagueSeed(s);
  const strength = s.rivalTeams.map(teamStrength);
  const out: LeagueGame[] = [];
  for (let day = 0; day < Math.min(days, SEASON.GAMES); day++) {
    for (const [a, b] of rivalPairs(day)) {
      const winner = draw(seed, day, a, b) < winChance(strength[a], strength[b]) ? a : b;
      out.push({ day, home: a, away: b, winner });
    }
  }
  return out;
}

/** The player's result against rival `r`, if that day has been played. */
function playerVs(s: SeasonState, r: number): GameResult | undefined {
  return s.results[r];
}

/**
 * The league table after the days played so far, best first. Ranked by
 * points (a win 1, a tie ½), then head-to-head among the tied teams, then
 * the player ahead (it is their league), then the stronger roster.
 */
export function standings(s: SeasonState): StandingsRow[] {
  const days = s.results.length;
  const rows = new Map<TeamIdx, StandingsRow>();
  for (const team of [YOU, ...s.rivals.map((_, i) => i)]) rows.set(team, { team, w: 0, l: 0, t: 0 });
  s.results.forEach((r, day) => {
    const you = rows.get(YOU)!;
    const them = rows.get(day)!;
    if (r === 'W') (you.w++, them.l++);
    else if (r === 'L') (you.l++, them.w++);
    else (you.t++, them.t++);
  });
  const games = rivalGames(s, days);
  for (const g of games) {
    rows.get(g.winner)!.w++;
    rows.get(g.winner === g.home ? g.away : g.home)!.l++;
  }

  const pts = (r: StandingsRow) => r.w + r.t / 2;
  const strength = s.rivalTeams.map(teamStrength);
  /** Did `a` beat `b`? 1 yes, 0 no, ½ a tie, null if they haven't met. */
  const beat = (a: TeamIdx, b: TeamIdx): number | null => {
    if (a === YOU || b === YOU) {
      const r = playerVs(s, a === YOU ? b : a);
      if (!r) return null;
      const youWon = r === 'W' ? 1 : r === 'L' ? 0 : 0.5;
      return a === YOU ? youWon : 1 - youWon;
    }
    const g = games.find((x) => (x.home === a && x.away === b) || (x.home === b && x.away === a));
    return g ? (g.winner === a ? 1 : 0) : null;
  };

  const all = [...rows.values()];
  const h2h = (r: StandingsRow) =>
    all
      .filter((o) => o.team !== r.team && pts(o) === pts(r))
      .reduce((sum, o) => sum + (beat(r.team, o.team) ?? 0), 0);
  return all.sort(
    (a, b) =>
      pts(b) - pts(a) ||
      h2h(b) - h2h(a) ||
      (a.team === YOU ? -1 : b.team === YOU ? 1 : 0) ||
      strength[b.team] - strength[a.team] ||
      a.team - b.team
  );
}

/**
 * Saturday's championship: when the week is done and the player finished in
 * the top two, the other top-two team is the opponent. null otherwise — no
 * final to play (missed the cut, or the week isn't over yet).
 */
export function finalOpponent(s: SeasonState): number | null {
  if (s.results.length < SEASON.GAMES) return null;
  const [first, second] = standings(s);
  if (first.team === YOU) return second.team;
  if (second.team === YOU) return first.team;
  return null;
}

/** Is there a championship still to play this week? */
export function finalPending(s: SeasonState): boolean {
  return finalOpponent(s) !== null && !s.final;
}
