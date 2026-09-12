// ---------------------------------------------------------------------------
// The session fold, driven by real seeded games and reconciled with the sim's
// own tally. A count that is off by one is invisible in a browser; here it is
// a red line against `GameResult.tally`, the per-kid `lines`, and the rule
// that every top half ends on exactly three outs.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { simulateGameLive, type GameResult, type SimEvent } from '../sim/game';
import { makeRng } from '../sim/rng';
import { ROSTER, getCharacter } from '../../data/characters';
import { snapshot, type Snapshot } from './soundCues';
import {
  INPUT_VERBS,
  emptySession,
  foldEvent,
  foldFrame,
  foldInput,
  type SessionCounts,
} from './sessionModel';
import type { PlayerControlMode } from '../game/controlMode';

const AWAY = ROSTER.slice(0, 9).map((c) => c.id);
const HOME = ROSTER.slice(9, 18).map((c) => c.id);

/** A whole game per case; the first one also warms the pitch memo. Same budget as `game.test.ts`. */
const PLAYS_GAMES = 30_000;

/**
 * Pump a whole game by hand exactly as `sessionLog.ts` sees it: events arrive
 * synchronously inside `next()`, against the half of the frame last yielded;
 * each yielded frame is snapshotted (copied) and folded against the previous.
 */
function foldGame(seed: string, mode: PlayerControlMode): { s: SessionCounts; g: GameResult } {
  let s = emptySession();
  let prev: Snapshot | null = null;
  let half: 'top' | 'bottom' = 'top';
  const onEvent = (e: SimEvent) => {
    s = foldEvent(s, e, mode, half);
  };
  const it = simulateGameLive(
    { away: { name: 'A', ids: AWAY }, home: { name: 'H', ids: HOME }, lookup: getCharacter, onEvent },
    makeRng(seed)
  );
  let r = it.next();
  while (!r.done) {
    const next = snapshot(r.value);
    s = foldFrame(s, prev, next, mode);
    prev = next;
    half = next.half;
    r = it.next();
  }
  return { s, g: r.value };
}

const sum = (g: GameResult, ids: string[], key: 'h' | 'k') =>
  ids.reduce((n, id) => n + (g.lines[id]?.[key] ?? 0), 0);

describe('★ the fold reconciles with the sim it watched', () => {
  const SEEDS = ['a', 'b', 'c'];

  it.each(SEEDS)('seed %s: counts every pitch the tally counted', (seed) => {
    const { s, g } = foldGame(seed, 'both');
    expect(s.pitches).toBe(g.tally.pitches);
    expect(s.pitches).toBeGreaterThan(100);
  }, PLAYS_GAMES);

  it.each(SEEDS)('seed %s: human-side hits are the away lineup’s hits, and strikeouts the home pitchers’', (seed) => {
    // In `both` the person bats the TOP, so their hits are the away kids' `h`
    // and their strikeouts are the ones the HOME pitchers threw.
    const { s, g } = foldGame(seed, 'both');
    expect(s.humanBat.hits).toBe(sum(g, AWAY, 'h'));
    expect(s.humanBat.strikeouts).toBe(sum(g, HOME, 'k'));
    expect(s.humanBat.pitchesSeen).toBeGreaterThan(0);
    expect(s.humanBat.pitchesSeen).toBeLessThan(s.pitches);
    // A whiff is a swing; a swing is a pitch seen.
    expect(s.humanBat.whiffs).toBeLessThanOrEqual(s.humanBat.swings);
    expect(s.humanBat.swings).toBeLessThanOrEqual(s.humanBat.pitchesSeen);
  }, PLAYS_GAMES);

  it.each(SEEDS)('seed %s: every top half ends on three outs, and they are the CPU’s', (seed) => {
    // The person fields the BOTTOM in `both`; the CPU fields every top half,
    // and a top half always completes (a walk-off is a bottom-half event).
    const { s, g } = foldGame(seed, 'both');
    expect(s.cpuField.outs).toBe(3 * g.innings);
    expect(s.humanField.outs).toBeGreaterThan(0);
    // The bottoms: three each, except a skipped or walk-off last one.
    expect(s.humanField.outs).toBeLessThanOrEqual(3 * g.innings);
    expect(s.humanField.outs).toBeGreaterThanOrEqual(3 * (g.innings - 1));
  }, PLAYS_GAMES);

  it.each(SEEDS)('seed %s: ends on the final score', (seed) => {
    const { s, g } = foldGame(seed, 'both');
    expect(s.score).toEqual({ away: g.awayScore, home: g.homeScore });
    expect(s.inning).toBe(g.innings);
  }, PLAYS_GAMES);

  it('★ a hands-free mode has no human side at all', () => {
    const { s, g } = foldGame('a', 'watch');
    expect(s.pitches).toBe(g.tally.pitches);
    expect(s.humanBat).toEqual({ pitchesSeen: 0, swings: 0, whiffs: 0, hits: 0, strikeouts: 0, walks: 0 });
    expect(s.humanField.outs).toBe(0);
    expect(s.cpuField.outs).toBeGreaterThan(0);
  }, PLAYS_GAMES);

  it('★ batting-only and pitching-only split the same game between them', () => {
    const both = foldGame('b', 'both').s;
    const batting = foldGame('b', 'batting').s;
    const pitching = foldGame('b', 'pitching').s;
    expect(batting.humanBat).toEqual(both.humanBat);
    expect(batting.humanField.outs).toBe(0);
    expect(pitching.humanField.outs).toBe(both.humanField.outs);
    expect(pitching.humanBat.pitchesSeen).toBe(0);
  }, PLAYS_GAMES);
});

describe('inputs', () => {
  it('counts each verb separately and never touches the others', () => {
    let s = emptySession();
    s = foldInput(s, 'swing');
    s = foldInput(s, 'swing');
    s = foldInput(s, 'dive');
    expect(s.taps.swing).toBe(2);
    expect(s.taps.dive).toBe(1);
    for (const v of INPUT_VERBS) if (v !== 'swing' && v !== 'dive') expect(s.taps[v]).toBe(0);
  });

  it('starts every verb at zero', () => {
    const s = emptySession();
    expect(Object.keys(s.taps).sort()).toEqual([...INPUT_VERBS].sort());
    for (const v of INPUT_VERBS) expect(s.taps[v]).toBe(0);
  });

  it('is a fold — the input is not mutated', () => {
    const a = emptySession();
    const b = foldInput(a, 'pitch');
    expect(a.taps.pitch).toBe(0);
    expect(b.taps.pitch).toBe(1);
  });
});

describe('frames', () => {
  const base: Snapshot = { inning: 1, half: 'top', outs: 0, awayScore: 0, homeScore: 0, phase: 'between' };
  const at = (over: Partial<Snapshot>): Snapshot => ({ ...base, ...over });

  it('★ an out is a RISE, so the reset at a new half is not an out', () => {
    let s = emptySession();
    s = foldFrame(s, at({ outs: 2 }), at({ outs: 3 }), 'both');
    expect(s.cpuField.outs).toBe(1);
    s = foldFrame(s, at({ outs: 3 }), at({ outs: 0, half: 'bottom' }), 'both');
    expect(s.cpuField.outs).toBe(1);
    expect(s.humanField.outs).toBe(0);
  });

  it('credits a double play as two', () => {
    const s = foldFrame(emptySession(), at({ outs: 1, half: 'bottom' }), at({ outs: 3, half: 'bottom' }), 'both');
    expect(s.humanField.outs).toBe(2);
  });

  it('keeps the same object when nothing changed', () => {
    const s = emptySession();
    expect(foldFrame(s, base, base, 'both')).toBe(s);
  });
});
