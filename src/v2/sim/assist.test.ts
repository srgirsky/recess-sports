// ---------------------------------------------------------------------------
// Skill levels (`assist.ts`): identity at NORMAL, inert without a person, and a
// real difference in a live game where a person bats.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { assistBatter, assistPitchPlan, assistSwing, parseSkill, SKILLS } from './assist';
import { simulateGame, simulateGameLive, type GameResult, type GameSpec, type LiveFrame } from './game';
import { throwPitch } from './atbat';
import { makeRng } from './rng';
import { zoneBandFt } from './athletes';
import { ROSTER, getCharacter } from '../../data/characters';

const AWAY = ROSTER.slice(0, 9).map((c) => c.id);
const HOME = ROSTER.slice(9, 18).map((c) => c.id);
const spec = (over: Partial<GameSpec> = {}): GameSpec => ({
  away: { name: 'Rockets', ids: AWAY },
  home: { name: 'Comets', ids: HOME },
  lookup: getCharacter,
  regulationInnings: 2,
  ...over,
});
const fp = (g: GameResult) => JSON.stringify([g.awayScore, g.homeScore, g.tally, g.log.length]);
const pitchSpec = () => ({ pitcher: ROSTER[0], batter: ROSTER[1], count: { balls: 0, strikes: 0 } });

describe('skill levels are pure and bounded', () => {
  it('parses only known levels and defaults to normal', () => {
    expect(parseSkill('tball')).toBe('tball');
    expect(parseSkill('allstar')).toBe('allstar');
    expect(parseSkill('nope')).toBe('normal');
    expect(parseSkill(null)).toBe('normal');
  });

  it('NORMAL is the identity: same swing, no plan, same batter object', () => {
    const inFlight = throwPitch(pitchSpec(), makeRng('n'));
    const swing = { atSec: inFlight.travelSec + 0.1, aimHeightFt: 1 };
    expect(assistSwing('normal', swing, inFlight)).toBe(swing);
    expect(assistPitchPlan('normal', pitchSpec(), makeRng('n'))).toBeUndefined();
    expect(assistBatter('normal', ROSTER[3])).toBe(ROSTER[3]);
  });

  it('T-BALL pulls the swing toward the pitch without reaching it', () => {
    const inFlight = throwPitch(pitchSpec(), makeRng('t'));
    const swing = { atSec: inFlight.travelSec + 0.1, aimHeightFt: inFlight.crossing.y - 1 };
    const a = assistSwing('tball', swing, inFlight)!;
    expect(Math.abs(a.atSec - inFlight.travelSec)).toBeLessThan(0.1);
    expect(Math.abs(a.atSec - inFlight.travelSec)).toBeGreaterThan(0);
    expect(Math.abs(a.aimHeightFt - inFlight.crossing.y)).toBeLessThan(1);
    expect(assistSwing('tball', undefined, inFlight)).toBeUndefined();
  });

  it('T-BALL throws a changeup down the middle; ALL-STAR paints', () => {
    const [lo, hi] = zoneBandFt();
    const meat = assistPitchPlan('tball', pitchSpec(), makeRng('m'))!;
    expect(meat).toEqual({ kind: 'fastball', aimLateralFt: 0, aimHeightFt: (lo + hi) / 2 });
    const edges = Array.from({ length: 40 }, (_, i) => assistPitchPlan('allstar', pitchSpec(), makeRng(`e${i}`))!);
    expect(edges.some((p) => p.aimLateralFt !== 0 || p.aimHeightFt !== (lo + hi) / 2)).toBe(true);
  });

  it('clamps the CPU batter contact stat to 1..10', () => {
    for (const c of ROSTER) {
      const weak = assistBatter('tball', c).stats.contact;
      const sharp = assistBatter('allstar', c).stats.contact;
      expect(weak).toBeGreaterThanOrEqual(1);
      expect(sharp).toBeLessThanOrEqual(10);
      expect(weak).toBeLessThanOrEqual(c.stats.contact);
      expect(sharp).toBeGreaterThanOrEqual(c.stats.contact);
    }
  });
});

describe('★ a skill level touches only a person’s game', () => {
  it('without a human side every level fingerprints identically', () => {
    const base = fp(simulateGame(spec(), makeRng('a')));
    for (const skill of SKILLS) expect(fp(simulateGame(spec({ skill }), makeRng('a')))).toBe(base);
  }, 60_000);

  /** Drive a game where the person bats the top half with a late, low swing on every pitch. */
  function personBats(skill: 'tball' | 'rookie' | 'normal', seed: string, same = false): { swings: number; inPlay: number; hits: number; ks: number } {
    let swings = 0;
    let inPlay = 0;
    let top = false;
    let hits = 0;
    let ks = 0;
    const it = simulateGameLive(
      spec({
        humanSide: 'away',
        skill,
        onEvent: (e) => {
          if (e.t === 'contact' && !e.foul && top) inPlay++;
          if (e.t === 'pa' && top && e.result === 'hit') hits++;
          if (e.t === 'pa' && top && e.result === 'k') ks++;
        },
      }),
      makeRng(seed)
    );
    let r = it.next();
    for (let n = 0; !r.done && n < 200_000; n++) {
      const f: LiveFrame = r.value;
      top = f.half === 'top';
      if (f.phase === 'pitch' && f.half === 'top' && f.pitch) {
        // A clumsy child: late and low, by an amount that wanders — or, with
        // `same`, the identical tap every time.
        const late = same ? 0.09 : [0.09, 0.05, 0.12, 0.07][swings % 4];
        swings++;
        r = it.next({ swing: { atSec: f.pitch.travelSec + late, aimHeightFt: 1.2 } });
        continue;
      }
      r = it.next({});
    }
    return { swings, inPlay, hits, ks };
  }

  it('T-BALL turns the same clumsy swing into more balls in play than NORMAL', () => {
    const sum = (skill: 'tball' | 'rookie' | 'normal') =>
      ['s1', 's2', 's4', 's5'].map((seed) => personBats(skill, seed)).reduce(
        (a, b) => ({ hits: a.hits + b.hits, ks: a.ks + b.ks }),
        { hits: 0, ks: 0 }
      );
    const tb = sum('tball');
    const nm = sum('normal');
    const rk = sum('rookie');
    // Ordering, not values: each easier level helps the same clumsy child.
    expect(tb.hits).toBeGreaterThan(nm.hits);
    expect(tb.ks).toBeLessThan(nm.ks);
    expect(rk.ks).toBeLessThan(nm.ks);
    expect(tb.ks).toBeLessThanOrEqual(rk.ks);
  }, 240_000);

  it('T-BALL never runs a plate appearance into the pitch cap', () => {
    // The same late tap on every pitch: without the patience ramp this fouls
    // forever and the sim throws.
    expect(() => personBats('tball', 's3', true)).not.toThrow();
  }, 60_000);
});
