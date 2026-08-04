// ---------------------------------------------------------------------------
// ★ THE SCOREBOARD MUST BE ABLE TO SHOW EVERYTHING THE SIM CAN PRODUCE.
//
// A pip row has a fixed number of slots, so its capacity is a CLAIM about the
// rules: "a count never reaches four balls". If that claim is wrong the display
// does not crash — it silently clamps, and a kid watching sees the count stop
// moving on the pitch that walked him. There is no error, no test failure and
// nothing in the console; it just quietly stops being true.
//
// So the capacities are swept against real games rather than reasoned about,
// and the sweep is what corrected the obvious guess. Balls stop at 3 and
// strikes at 2, because the fourth and the third end the plate appearance and
// `inning.applyAtBat` owns that. OUTS ARE NOT SYMMETRIC WITH IT: three really
// does occur, on the `between` frame after the side is retired, because the half
// is over but the frame still describes it. Writing `MAX_OUTS = 2` by analogy
// with the count would have dropped the third out pip on every half-inning.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { simulateGameLive, type LiveFrame } from '../sim/game';
import { makeRng } from '../sim/rng';
import { ROSTER, getCharacter } from '../../data/characters';
import {
  MAX_BALLS,
  MAX_OUTS,
  MAX_STRIKES,
  battingSide,
  halfMark,
  scoreboardModel,
} from './scoreboardModel';

const TEAMS = { away: 'ROCKETS', home: 'COMETS' };
const names = (id: string) => getCharacter(id).name;

/**
 * Play a game, calling `visit` on every tick.
 *
 * ⚠️ FOLDING DURING ITERATION IS NOT A STYLE CHOICE. `simulateGameLive` yields
 * the SAME object every tick, mutated in place — see `LiveFrame`. Collecting
 * frames into an array gives N references to one object holding the last tick's
 * state, so the peak-count sweep below answered 0 for every field before this
 * was a visitor. Nothing errors; every value just quietly becomes the final one.
 */
function sweep(seed: string, visit: (f: LiveFrame) => void): number {
  const g = simulateGameLive(
    {
      away: { name: TEAMS.away, ids: ROSTER.slice(0, 9).map((c) => c.id) },
      home: { name: TEAMS.home, ids: ROSTER.slice(9, 18).map((c) => c.id) },
      lookup: getCharacter,
    },
    makeRng(seed)
  );
  let n = 0;
  let r = g.next({});
  while (!r.done) {
    visit(r.value);
    n++;
    r = g.next({});
  }
  return n;
}

const SEEDS = ['a', 'b', 'c', 'd', 'e'];

function sweepAll(visit: (f: LiveFrame) => void): number {
  return SEEDS.reduce((n, s) => n + sweep(s, visit), 0);
}

describe("★ the pip capacities are the sim's, not a guess", () => {
  it('★ never has to clamp a real frame, and lights every slot it draws', () => {
    // Both halves of the capacity claim, in one sweep.
    //
    // Clamping is the dangerous direction: the model would silently drop the
    // pip that walked the batter, with no error anywhere. So assert the clamp
    // was a NO-OP rather than assert that clamping works.
    //
    // And a slot that can NEVER light is the other failure — a dot drawn
    // permanently dark is indistinguishable, to a six-year-old, from one that
    // is dark right now.
    const peak = { balls: 0, strikes: 0, outs: 0 };
    const frames = sweepAll((f) => {
      const m = scoreboardModel(f, TEAMS, names);
      expect(m.balls.lit, `balls ${f.balls} exceeds ${MAX_BALLS}`).toBe(f.balls);
      expect(m.strikes.lit, `strikes ${f.strikes} exceeds ${MAX_STRIKES}`).toBe(f.strikes);
      expect(m.outs.lit, `outs ${f.outs} exceeds ${MAX_OUTS}`).toBe(f.outs);
      peak.balls = Math.max(peak.balls, f.balls);
      peak.strikes = Math.max(peak.strikes, f.strikes);
      peak.outs = Math.max(peak.outs, f.outs);
    });

    expect(peak.balls).toBe(MAX_BALLS);
    expect(peak.strikes).toBe(MAX_STRIKES);
    // ★ THREE, AND NOT TWO BY ANALOGY WITH THE COUNT. The count stops one short
    // of its rule because ball four and strike three end the plate appearance;
    // the third OUT is still on the frame that reports the side retired.
    expect(peak.outs).toBe(MAX_OUTS);

    // A sweep that saw nothing proves nothing.
    expect(frames).toBeGreaterThan(5_000);
  });

  it('★ yields one reused frame, which is why this file never keeps one', () => {
    // Pins the contract `LiveFrame` documents, so a change to fresh-per-yield is
    // a deliberate, reviewed act rather than a silent one — and so the next
    // person who writes `frames.push(f)` has a failing test to read.
    const kept: LiveFrame[] = [];
    sweep('a', (f) => {
      if (kept.length < 50) kept.push(f);
    });
    expect(new Set(kept).size, 'the generator is documented as reusing its frame').toBe(1);
  });
});

describe('the model reads a frame', () => {
  /** One frame's fields, COPIED — see `sweep`'s warning about retaining one. */
  let frame!: LiveFrame;
  sweep('a', (f) => {
    frame ??= { ...f, bases: [...f.bases] as [boolean, boolean, boolean] };
  });

  it('marks exactly one side as batting, and it is the one the half says', () => {
    sweepAll((f) => {
      const m = scoreboardModel(f, TEAMS, names);
      expect(m.away.batting !== m.home.batting, 'exactly one side bats').toBe(true);
      expect(m.away.batting).toBe(f.half === 'top');
      expect(battingSide(f.half)).toBe(f.half === 'top' ? 'away' : 'home');
    });
  });

  it('carries the scores under the right names', () => {
    const m = scoreboardModel(frame, TEAMS, names);
    expect(m.away.name).toBe('ROCKETS');
    expect(m.home.name).toBe('COMETS');
    expect(m.away.runs).toBe(frame.awayScore);
    expect(m.home.runs).toBe(frame.homeScore);
  });

  it('resolves ids to names through the injected lookup, never a global', () => {
    const m = scoreboardModel(frame, TEAMS, (id) => `<${id}>`);
    expect(m.batter).toBe(`<${frame.batterId}>`);
    expect(m.pitcher).toBe(`<${frame.pitcherId}>`);
  });

  it('copies the bases first-second-third, in that order', () => {
    // The diamond draws first on the RIGHT, so an order swap here puts a runner
    // on the wrong corner — visible to a player and to no test but this one.
    let on: [boolean, boolean, boolean] | null = null;
    sweepAll((f) => {
      if (!on && f.bases[0] !== f.bases[2]) on = [...f.bases] as [boolean, boolean, boolean];
    });
    expect(on, 'no frame with an asymmetric base state to test against').not.toBeNull();
    const stub = { ...frame, bases: on! };
    const m = scoreboardModel(stub, TEAMS, names);
    expect(m.bases).toEqual(on);
    // A COPY, not the frame's own array — the frame is reused and mutated.
    expect(m.bases).not.toBe(stub.bases);
  });

  it('says which side the human is on, because the tap verbs collide without it', () => {
    expect(scoreboardModel(frame, TEAMS, names, 'bat').you).toBe('bat');
    expect(scoreboardModel(frame, TEAMS, names, 'pitch').you).toBe('pitch');
    expect(scoreboardModel(frame, TEAMS, names).you).toBeNull();
  });

  it('points the half arrow the way a line score reads', () => {
    expect(halfMark('top')).toBe('▲');
    expect(halfMark('bottom')).toBe('▼');
  });
});
