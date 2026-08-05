// ---------------------------------------------------------------------------
// The today-line must agree with the stats stream it restates.
//
// The failure this prevents: a tally that counts walks as at-bats, or hits
// for the wrong kid, reads as a plausible number forever — nobody can eyeball
// "1 FOR 3" against the sim. So the model is checked two ways: unit rules for
// the official-at-bat edge, and a whole-game sweep asserting the fold of `pa`
// events equals the `GameResult`'s own per-kid stat lines.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { MatchupTally } from './matchupModel';
import { simulateGame, type SimEvent } from '../sim/game';
import { makeRng } from '../sim/rng';
import { ROSTER, getCharacter } from '../../data/characters';

const pa = (batterId: string, pitcherId: string, result: 'k' | 'walk' | 'hit' | 'out'): SimEvent => ({
  t: 'pa',
  batterId,
  pitcherId,
  result,
});

describe('MatchupTally', () => {
  it('keeps the official-at-bat rule: a walk is not one', () => {
    const t = new MatchupTally();
    t.onEvent(pa('kid', 'arm', 'walk'));
    expect(t.lines('kid', 'arm').batter).toBe('FIRST AT-BAT');
    expect(t.lines('kid', 'arm').pitcher).toBe('0 K · 1 BB');
    t.onEvent(pa('kid', 'arm', 'hit'));
    t.onEvent(pa('kid', 'arm', 'out'));
    expect(t.lines('kid', 'arm').batter).toBe('1 FOR 2 TODAY');
  });

  it('resets to a fresh day', () => {
    const t = new MatchupTally();
    t.onEvent(pa('kid', 'arm', 'k'));
    t.reset();
    expect(t.lines('kid', 'arm').batter).toBe('FIRST AT-BAT');
    expect(t.lines('kid', 'arm').pitcher).toBe('0 K · 0 BB');
  });

  // A whole game under full-suite CPU contention outruns the 5s default —
  // the same class the goldens already size for.
  it('★ folds a whole game to the same per-kid lines the result carries', { timeout: 30_000 }, () => {
    const events: SimEvent[] = [];
    const result = simulateGame(
      {
        away: { name: 'A', ids: ROSTER.slice(0, 9).map((c) => c.id) },
        home: { name: 'H', ids: ROSTER.slice(9, 18).map((c) => c.id) },
        lookup: getCharacter,
        onEvent: (e) => events.push({ ...e }),
      },
      makeRng('matchup-sweep')
    );
    const t = new MatchupTally();
    for (const e of events) t.onEvent(e);

    const paEvents = events.filter((e) => e.t === 'pa');
    expect(paEvents.length, 'the game emitted no pa events').toBeGreaterThan(20);
    for (const id of ROSTER.slice(0, 18).map((c) => c.id)) {
      const line = result.lines[id];
      const ab = line?.ab ?? 0;
      const h = line?.h ?? 0;
      const want = ab === 0 ? 'FIRST AT-BAT' : `${h} FOR ${ab} TODAY`;
      expect(t.lines(id, id).batter, `batter line for ${id}`).toBe(want);
    }
  });
});
