// ---------------------------------------------------------------------------
// Headless tests for the live-play sim — scripted plays with fake inputs prove
// catches, force races, tap-to-run, CPU policies, and termination without a
// browser. Run with: npm test
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import type { Character } from '../data/types';
import { resolveContact, type Launch } from './atbat';
import { resolveLiveParams, type LiveParams } from './mode';
import { HOME, FENCE_Y, FIRST, type PositionId } from './geometry';
import {
  startLivePlay,
  stepLivePlay,
  finishLivePlay,
  type LivePlayState,
  type LiveInputs,
  type LiveEvent,
} from './liveplay';
import { applyLivePlay, newHalfInning } from './inning';

const seq = (nums: number[]) => {
  let i = 0;
  return () => nums[i++ % nums.length];
};

const plain = (over: Partial<Character>): Character => ({
  id: 'x',
  name: 'X',
  tagline: '',
  stats: { contact: 5, power: 5, speed: 5, pitching: 5 },
  visual: { skin: 0, hair: 'short', hairColor: 0, uniform: 0, accessory: 'none' },
  ability: 'none',
  ...over,
});

const POSITIONS: PositionId[] = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
const DEFENSE = POSITIONS.map((p, i) => ({ position: p, charId: `f${i}` }));

/** Drive a play to completion with per-tick scripted inputs. */
function runPlay(
  s: LivePlayState,
  params: LiveParams,
  perTick: (s: LivePlayState) => LiveInputs,
  rng: () => number = () => 0.5,
  dt = 50
): { s: LivePlayState; events: LiveEvent[] } {
  const events: LiveEvent[] = [];
  let guard = 0;
  while (s.phase !== 'done' && guard++ < 2000) {
    s = stepLivePlay(s, perTick(s), dt, params, rng);
    events.push(...s.events);
  }
  expect(s.phase).toBe('done');
  return { s, events };
}

const grounderToShort: Launch = {
  type: 'grounder',
  landing: { x: 395, y: 300 },
  hangMs: 0,
  rollSpeed: 350,
  homer: false,
};

const flyToCenter: Launch = {
  type: 'fly',
  landing: { x: 480, y: 240 },
  hangMs: 1200,
  rollSpeed: 350,
  homer: false,
};

describe('resolveContact: swing -> launch', () => {
  it('a miss is still a strike; never_strikes_out still prevents it', () => {
    expect(resolveContact('miss', plain({}), plain({}), seq([0.5])).kind).toBe('strike');
    const r = resolveContact('miss', plain({ ability: 'never_strikes_out' }), plain({}), seq([0.9, 0.5, 0.5, 0.5]));
    expect(r.kind).not.toBe('strike');
  });

  it('weak contact can still be fouled off', () => {
    expect(resolveContact('weak', plain({}), plain({}), seq([0.1])).kind).toBe('foul');
  });

  it('a crushed perfect fly clears the fence', () => {
    const slugger = plain({ stats: { contact: 5, power: 10, speed: 5, pitching: 5 } });
    // q roll 0.99 (+0.35 band +0.2 power) = 1.54 > HR_Q; type roll 0.7 -> fly.
    const r = resolveContact('perfect', slugger, plain({}), seq([0.99, 0.7, 0.5]));
    expect(r.kind).toBe('inPlay');
    if (r.kind === 'inPlay') expect(r.launch.homer).toBe(true);
  });

  it('non-homer landings always stay on the field, inside the foul cone', () => {
    for (let i = 0; i < 200; i++) {
      const r = resolveContact('good', plain({}), plain({}), () => Math.random());
      if (r.kind !== 'inPlay' || r.launch.homer) continue;
      const { landing } = r.launch;
      expect(landing.y).toBeGreaterThan(FENCE_Y - 1);
      expect(landing.y).toBeLessThan(HOME.y);
      // Inside the foul lines: |dx| grows at most ~1.2 px per px of rise.
      const rise = HOME.y - landing.y;
      expect(Math.abs(landing.x - HOME.x)).toBeLessThanOrEqual(rise * 1.21);
    }
  });
});

describe('live play: defense (the player fields)', () => {
  const kid = resolveLiveParams('kid');

  it('steering onto a grounder picks it up, and a strong throw beats the batter', () => {
    let s = startLivePlay({
      mode: 'defense',
      launch: grounderToShort,
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [],
      defense: DEFENSE,
      outs: 0,
      params: kid,
    });
    expect(s.fielders[s.active].position).toBe('SS'); // nearest the settle point

    let threw = false;
    const { s: end, events } = runPlay(s, kid, (st) => {
      if (st.ball.phase === 'held' && !threw) {
        threw = true;
        return { throwTo: { base: 1, power: 1 } };
      }
      return { pointer: st.ball.pos };
    });

    expect(events.some((e) => e.t === 'pickup')).toBe(true);
    expect(events.some((e) => e.t === 'out' && e.base === 1)).toBe(true);
    const outcome = finishLivePlay(end);
    expect(outcome.outs).toBe(1);
    expect(outcome.batterOut).toBe(true);
    expect(outcome.bases).toEqual([false, false, false]);
  });

  it('camping under a fly catches it; runners walk back free', () => {
    let s = startLivePlay({
      mode: 'defense',
      launch: flyToCenter,
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [{ base: 2, charId: 'r2', speed: 5 }],
      defense: DEFENSE,
      outs: 0,
      params: kid,
    });
    const { s: end, events } = runPlay(s, kid, () => ({ pointer: flyToCenter.landing }));
    expect(events.some((e) => e.t === 'catch')).toBe(true);
    const outcome = finishLivePlay(end);
    expect(outcome.batterOut).toBe(true);
    expect(outcome.outs).toBe(1);
    expect(outcome.runs).toBe(0);
    expect(outcome.bases).toEqual([false, true, false]); // runner back on 2nd
  });

  it('ignoring the ball entirely still terminates (cap) and the CPU runs wild', () => {
    let s = startLivePlay({
      mode: 'defense',
      // Lands in the SS/LF/3B gap — no fielder close enough to auto-grab it.
      launch: { ...flyToCenter, landing: { x: 335, y: 300 }, hangMs: 1100 },
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [{ base: 2, charId: 'r2', speed: 5 }],
      defense: DEFENSE,
      outs: 0,
      params: kid,
    });
    const { s: end } = runPlay(s, kid, () => ({}));
    expect(end.elapsed).toBeLessThanOrEqual(kid.maxPlayMs + 100);
    const outcome = finishLivePlay(end);
    // Nobody fielded it — the runner from 2nd (at least) comes around to score.
    expect(outcome.runs).toBeGreaterThanOrEqual(1);
    expect(outcome.outs).toBe(0);
  });

  it('a slow CPU batter is thrown out; a jackrabbit beats the same throw', () => {
    const race = (speed: number) => {
      let s = startLivePlay({
        mode: 'defense',
        launch: grounderToShort,
        batter: { charId: 'bat', speed },
        baseRunners: [],
        defense: DEFENSE,
        outs: 0,
        params: kid,
      });
      // Field it, then dawdle until 900ms before lobbing a soft throw — slow
      // enough that only the slow runner loses the race to first.
      let threw = false;
      const { s: end } = runPlay(s, kid, (st) => {
        if (st.ball.phase === 'held' && !threw && st.elapsed >= 900) {
          threw = true;
          return { throwTo: { base: 1, power: 0 } };
        }
        return st.ball.phase === 'held' ? {} : { pointer: st.ball.pos };
      });
      return finishLivePlay(end);
    };
    expect(race(1).batterOut).toBe(true);
    expect(race(10).batterOut).toBe(false);
  });
});

describe('live play: offense (the player runs)', () => {
  const kid = resolveLiveParams('kid');
  const main = resolveLiveParams('main');

  it('the batter auto-runs to first with zero input (no soft-lock)', () => {
    let s = startLivePlay({
      mode: 'offense',
      launch: { ...grounderToShort, landing: { x: 300, y: 240 } }, // through the infield
      batter: { charId: 'bat', speed: 8 },
      baseRunners: [],
      defense: DEFENSE,
      outs: 0,
      params: kid,
    });
    const { s: end } = runPlay(s, kid, () => ({}));
    const outcome = finishLivePlay(end);
    expect(outcome.batterOut).toBe(false);
    expect(outcome.bases[0]).toBe(true); // safe at first
  });

  it('in main mode, a slow batter is forced out at first by the CPU defense', () => {
    let s = startLivePlay({
      mode: 'offense',
      launch: grounderToShort,
      batter: { charId: 'bat', speed: 1 },
      baseRunners: [],
      defense: DEFENSE,
      outs: 0,
      params: main,
    });
    const { s: end, events } = runPlay(s, main, () => ({}), seq([0.5]));
    expect(events.some((e) => e.t === 'out' && e.base === 1)).toBe(true);
    expect(finishLivePlay(end).batterOut).toBe(true);
  });

  it('a tap mid-leg is a no-op; a tap while settled takes the extra base', () => {
    let s = startLivePlay({
      mode: 'offense',
      launch: { type: 'grounder', landing: { x: 700, y: 250 }, hangMs: 0, rollSpeed: 420, homer: false },
      batter: { charId: 'bat', speed: 10 },
      baseRunners: [],
      defense: DEFENSE,
      outs: 0,
      params: kid,
    });
    // Tap immediately: the batter is mid-leg to first, so nothing changes.
    s = stepLivePlay(s, { run: true }, 50, kid, () => 0.5);
    const batter = s.runners.find((r) => r.isBatter)!;
    expect(batter.to).toBe(1);

    // Walk him to first, then tap — he should take off for second.
    let guard = 0;
    while (!(batter.to === 1 && batter.from === 1) && guard++ < 500 && s.phase !== 'done') {
      s = stepLivePlay(s, {}, 50, kid, () => 0.5);
    }
    expect(batter.from).toBe(1);
    s = stepLivePlay(s, { run: true }, 50, kid, () => 0.5);
    expect(batter.to).toBe(2);
  });

  it('forced runners go automatically; an unforced runner waits for the tap', () => {
    let s = startLivePlay({
      mode: 'offense',
      launch: { ...grounderToShort, landing: { x: 700, y: 260 } },
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [
        { base: 1, charId: 'r1', speed: 5 }, // forced by the batter
        { base: 3, charId: 'r3', speed: 5 }, // NOT forced (2nd is empty)
      ],
      defense: DEFENSE,
      outs: 0,
      params: kid,
    });
    const r1 = s.runners.find((r) => r.charId === 'r1')!;
    const r3 = s.runners.find((r) => r.charId === 'r3')!;
    expect(r1.to).toBe(2); // already running
    expect(r3.to).toBe(3); // holding
  });
});

describe('live play: folding into the inning', () => {
  it('applyLivePlay lands outs/runs/bases and resets the count', () => {
    const prev = newHalfInning();
    prev.outs = 1;
    prev.count = { balls: 2, strikes: 1 };
    const applied = applyLivePlay(prev, {
      outs: 1,
      runs: 2,
      bases: [true, false, false],
      baseIds: ['bat', null, null],
      batterOut: false,
      flyCaught: false,
      description: 'x',
    });
    expect(applied.state.outs).toBe(2);
    expect(applied.state.runs).toBe(2);
    expect(applied.runsScored).toBe(2);
    expect(applied.state.bases).toEqual([true, false, false]);
    expect(applied.state.count).toEqual({ balls: 0, strikes: 0 });
    expect(applied.batterDone).toBe(true);
  });
});

describe('live play: termination property', () => {
  it('random launches + random inputs always finish, with sane outs/runs', () => {
    const kid = resolveLiveParams('kid');
    const main = resolveLiveParams('main');
    for (let i = 0; i < 200; i++) {
      const params = i % 2 === 0 ? kid : main;
      const mode = i % 3 === 0 ? 'offense' : ('defense' as const);
      const r = resolveContact(
        (['perfect', 'good', 'weak'] as const)[i % 3],
        plain({ stats: { contact: 5, power: (i % 10) + 1, speed: ((i * 3) % 10) + 1, pitching: 5 } }),
        plain({}),
        () => Math.random()
      );
      if (r.kind !== 'inPlay' || r.launch.homer) continue;
      const nRunners = i % 4; // 0-3 runners aboard
      const baseRunners = ([1, 2, 3] as const)
        .slice(0, nRunners)
        .map((b) => ({ base: b, charId: `r${b}`, speed: ((i * 7) % 10) + 1 }));
      let s = startLivePlay({
        mode: mode as 'offense' | 'defense',
        launch: r.launch,
        batter: { charId: 'bat', speed: ((i * 5) % 10) + 1 },
        baseRunners,
        defense: DEFENSE,
        outs: i % 3,
        params,
      });
      let guard = 0;
      while (s.phase !== 'done' && guard++ < 2000) {
        const inputs: LiveInputs = {};
        if (Math.random() < 0.8) inputs.pointer = { x: Math.random() * 960, y: Math.random() * 640 };
        if (Math.random() < 0.1)
          inputs.throwTo = { base: ((Math.floor(Math.random() * 4) + 1) as 1 | 2 | 3 | 4), power: Math.random() };
        if (Math.random() < 0.2) inputs.run = true;
        s = stepLivePlay(s, inputs, 50, params, () => Math.random());
      }
      expect(s.phase).toBe('done');
      const outcome = finishLivePlay(s);
      expect(s.outsBefore + outcome.outs).toBeLessThanOrEqual(3);
      expect(outcome.runs).toBeLessThanOrEqual(nRunners + 1);
      expect(outcome.runs).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('live play: geometry sanity', () => {
  it('first base screen position is where runners race to', () => {
    // A tripwire for anyone moving the diamond: the sim and the scene share
    // these coordinates, so a change here changes gameplay, not just pixels.
    expect(FIRST).toEqual({ x: 662, y: 358 });
  });
});
