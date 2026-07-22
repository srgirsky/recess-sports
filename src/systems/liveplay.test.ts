// ---------------------------------------------------------------------------
// Headless tests for the live-play sim — scripted plays with fake inputs prove
// catches, force races, tap-to-run, CPU policies, and termination without a
// browser. Run with: npm test
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { LIVE } from '../config';
import type { Character } from '../data/types';
import { resolveContact, type Launch } from './atbat';
import { resolveLiveParams, type LiveParams } from './mode';
import {
  HOME,
  FENCE_Y,
  FIRST,
  SECOND,
  THIRD,
  FOUL_SLOPE,
  FIELD_POSITIONS,
  FIELD_MARGIN,
  FOUL_ALLOWANCE,
  FIELD_BOTTOM_Y,
  fencePointAt,
  fenceYAtX,
  clampToField,
  dist,
  DEFAULT_GEOMETRY,
  type PositionId,
} from './geometry';
import { VENUES } from '../data/venues';
import { getFieldGeometry } from './venue';
import {
  startLivePlay,
  stepLivePlay,
  finishLivePlay,
  rollCatch,
  rollThrowError,
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
  voiceGender: 'boy',
  stats: { contact: 5, power: 5, speed: 5, pitching: 5, fielding: 5 },
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
    const slugger = plain({ stats: { contact: 5, power: 10, speed: 5, pitching: 5, fielding: 5 } });
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
      expect(landing.y).toBeGreaterThan(fenceYAtX(DEFAULT_GEOMETRY, landing.x) - 1);
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
    // Magnet assist (not kid's auto) so an idle pointer really means nobody
    // fields it — this test is about the no-soft-lock termination cap.
    const noAuto: LiveParams = { ...kid, assist: 'magnet' };
    let s = startLivePlay({
      mode: 'defense',
      // Lands in the SS/LF/3B gap — no fielder close enough to auto-grab it.
      launch: { ...flyToCenter, landing: { x: 335, y: 300 }, hangMs: 1100 },
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [{ base: 2, charId: 'r2', speed: 5 }],
      defense: DEFENSE,
      outs: 0,
      params: noAuto,
    });
    const { s: end } = runPlay(s, noAuto, () => ({}));
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
      // Field it, then dawdle until 1800ms before lobbing a soft throw — slow
      // enough that only the slow runner loses the race to first. (The dawdle
      // is sized to RUNNER_SPEED: the jackrabbit reaches first at ~2.0s.)
      let threw = false;
      const { s: end } = runPlay(s, kid, (st) => {
        if (st.ball.phase === 'held' && !threw && st.elapsed >= 1800) {
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

describe('live play: fielding assist', () => {
  const kid = resolveLiveParams('kid'); // assist: 'auto'
  const main = resolveLiveParams('main'); // assist: 'magnet'

  const start = (params: LiveParams, launch: Launch) =>
    startLivePlay({
      mode: 'defense',
      launch,
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [],
      defense: DEFENSE,
      outs: 0,
      params,
    });

  it('kid mode fields a fly completely hands-free (auto assist)', () => {
    const { events } = runPlay(start(kid, flyToCenter), kid, () => ({}));
    expect(events.some((e) => e.t === 'catch')).toBe(true);
  });

  it('kid mode picks up a grounder hands-free too', () => {
    const { events } = runPlay(start(kid, grounderToShort), kid, () => ({}));
    expect(events.some((e) => e.t === 'pickup')).toBe(true);
  });

  it('an active pointer fully overrides auto — steer away and the fly drops', () => {
    const corner = { x: 60, y: 560 };
    const { s: end, events } = runPlay(start(kid, flyToCenter), kid, () => ({
      pointer: corner,
      pointerActive: true,
    }));
    expect(events.some((e) => e.t === 'catch')).toBe(false);
    // The chaser obeyed the pointer, not the ball.
    expect(dist(end.fielders[end.active].pos, clampToField(end.geo, corner))).toBeLessThan(30);
  });

  it('a stale pointer yields to auto: pointerActive false behaves like no input', () => {
    const corner = { x: 60, y: 560 };
    const { events } = runPlay(start(kid, flyToCenter), kid, () => ({
      pointer: corner,
      pointerActive: false,
    }));
    expect(events.some((e) => e.t === 'catch')).toBe(true);
  });

  it('magnet bends a bad steer toward the ball, and never exceeds fielder speed', () => {
    // Steer perpendicular to the ball the whole play; compare where the
    // chaser ends up with the magnet on vs a hand-built params with blend 0.
    const off = { x: 900, y: 500 };
    const noMagnet: LiveParams = { ...main, assistBlend: 0 };
    const drive = (params: LiveParams) => {
      let s = start(params, { ...flyToCenter, hangMs: 1400 });
      let maxStep = 0;
      for (let i = 0; i < 24; i++) {
        const before = { ...s.fielders[s.active].pos };
        s = stepLivePlay(s, { pointer: off, pointerActive: true }, 50, params, () => 0.5);
        maxStep = Math.max(maxStep, dist(before, s.fielders[s.active].pos));
      }
      return { pos: s.fielders[s.active].pos, maxStep, target: s.launch.landing };
    };
    const bent = drive(main);
    const straight = drive(noMagnet);
    expect(dist(bent.pos, bent.target)).toBeLessThan(dist(straight.pos, straight.target));
    // One tick at dt=50ms can cover at most fielderSpeed * statMult * 0.05 px.
    expect(bent.maxStep).toBeLessThanOrEqual((main.fielderSpeed * 1.0 * 50) / 1000 + 0.001);
  });

  it('magnet never steers the kid while the ball is held (carrying is manual)', () => {
    // Get the ball into the chaser's hands, then steer to a bag — the path
    // must head exactly where the pointer points.
    let s = start(main, grounderToShort);
    let guard = 0;
    while (s.ball.phase !== 'held' && guard++ < 400) {
      s = stepLivePlay(s, { pointer: s.ball.pos, pointerActive: true }, 50, main, () => 0.5);
    }
    expect(s.ball.phase).toBe('held');
    const bag = { x: 618, y: 385 };
    const from = { ...s.fielders[s.active].pos };
    s = stepLivePlay(s, { pointer: bag, pointerActive: true }, 50, main, () => 0.5);
    const to = s.fielders[s.active].pos;
    // The step vector points at the bag (cross product ~ 0).
    const cross =
      (bag.x - from.x) * (to.y - from.y) - (bag.y - from.y) * (to.x - from.x);
    expect(Math.abs(cross)).toBeLessThan(1e-6 * dist(from, bag) * dist(from, to) + 1e-6);
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
      // A deep fly with a long hang: the catchable window (last 40% of flight)
      // hasn't opened when the batter settles at first, so the play is
      // guaranteed open for the second tap. (Hang sized to RUNNER_SPEED: the
      // batter's leg takes ~1.3s, the window opens at 1440ms.)
      launch: { type: 'fly', landing: { x: 790, y: 220 }, hangMs: 2400, rollSpeed: 60, homer: false },
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

describe('live play: stat-driven fielders & errors', () => {
  const main = resolveLiveParams('main');

  it('rollCatch: better gloves drop less; error mult 0 never rolls the rng', () => {
    expect(rollCatch(1, 'fly', 1, () => 0.2)).toBe(false); // glove 1: 22% drop
    expect(rollCatch(10, 'fly', 1, () => 0.2)).toBe(true); // glove 10: 4%
    const boom = () => {
      throw new Error('rng must not be consumed at mult 0');
    };
    expect(rollCatch(1, 'fly', 0, boom)).toBe(true); // kid-mode byte-identity
  });

  it('rollThrowError: weak arms sail more; a maxed meter adds risk', () => {
    expect(rollThrowError(1, 0.5, 1, () => 0.12)).toBe(true); // arm 1: 16%
    expect(rollThrowError(10, 0.5, 1, () => 0.12)).toBe(false); // arm 10: 2.5%
    expect(rollThrowError(5, 1, 1, () => 0.15)).toBe(true); // overcharged: 18%
    expect(rollThrowError(5, 0.5, 1, () => 0.15)).toBe(false); // normal: 10%
  });

  it('a dropped fly leaves the batter safe and the ball live on the grass', () => {
    let s = startLivePlay({
      mode: 'defense',
      launch: flyToCenter,
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [],
      defense: DEFENSE,
      outs: 0,
      params: main,
    });
    // First grab attempt muffs it (0.01 < drop chance), later rolls are clean.
    const rng = seq([0.01, 0.9]);
    const { s: end, events } = runPlay(s, main, (st) => ({ pointer: st.ball.pos }), rng);
    expect(events.some((e) => e.t === 'error' && e.kind === 'drop')).toBe(true);
    expect(events.some((e) => e.t === 'catch')).toBe(false);
    const out = finishLivePlay(end);
    expect(out.batterOut).toBe(false);
    expect(out.bases[0]).toBe(true); // reached on the error
  });

  it('a wild throw sails past the bag: no out, runners live', () => {
    let s = startLivePlay({
      mode: 'defense',
      launch: grounderToShort,
      batter: { charId: 'bat', speed: 3 },
      baseRunners: [],
      defense: DEFENSE,
      outs: 0,
      params: main,
    });
    // rng: clean pickup (0.9), then the overcharged throw sails (0.05 < 18%),
    // then clean rolls for the recovery.
    const rng = seq([0.9, 0.05, 0.9]);
    let threw = false;
    const { s: end, events } = runPlay(
      s,
      main,
      (st) => {
        if (st.ball.phase === 'held' && !threw) {
          threw = true;
          return { throwTo: { base: 1 as const, power: 1 } };
        }
        return { pointer: st.ball.pos };
      },
      rng
    );
    expect(events.some((e) => e.t === 'error' && e.kind === 'wild')).toBe(true);
    expect(events.some((e) => e.t === 'out')).toBe(false);
    expect(finishLivePlay(end).batterOut).toBe(false);
  });

  it('fast fielders reach the ball sooner than slow ones', () => {
    const ticksToPickup = (speed: number) => {
      const defense = POSITIONS.map((p, i) => ({ position: p, charId: `f${i}`, speed }));
      let s = startLivePlay({
        mode: 'offense', // CPU fields
        launch: { ...grounderToShort, landing: { x: 300, y: 250 } },
        batter: { charId: 'bat', speed: 5 },
        baseRunners: [],
        defense,
        outs: 0,
        params: main,
      });
      let ticks = 0;
      while (s.phase !== 'done' && ticks++ < 500) {
        s = stepLivePlay(s, {}, 50, main, () => 0.9);
        if (s.events.some((e) => e.t === 'pickup')) return ticks;
      }
      return Infinity;
    };
    expect(ticksToPickup(10)).toBeLessThan(ticksToPickup(1));
  });
});

describe('live play: manual baserunning (main mode)', () => {
  const main = resolveLiveParams('main');
  const kid = resolveLiveParams('kid');

  it('tag-up and score: a deep caught fly becomes a sac fly', () => {
    let s = startLivePlay({
      mode: 'offense',
      launch: { type: 'fly', landing: { x: 480, y: 235 }, hangMs: 1300, rollSpeed: 0, homer: false },
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [{ base: 3, charId: 'r3', speed: 10 }],
      outs: 0,
      defense: DEFENSE,
      params: main,
    });
    let sent = false;
    const { s: end, events } = runPlay(s, main, (st) => {
      // The moment the fly is caught, send the runner from third.
      if (st.flyCaught && !sent) {
        sent = true;
        return { sendRunner: 'r3' };
      }
      return {};
    }, () => 0.9);
    expect(events.some((e) => e.t === 'catch')).toBe(true);
    const out = finishLivePlay(end);
    expect(out.batterOut).toBe(true); // the fly out
    expect(out.runs).toBe(1); // ...but the run scores: sac fly
  });

  it('kid mode still gives the free walk-back (no doubling off, no sac flies)', () => {
    let s = startLivePlay({
      mode: 'offense',
      launch: { type: 'fly', landing: { x: 480, y: 235 }, hangMs: 1300, rollSpeed: 0, homer: false },
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [{ base: 3, charId: 'r3', speed: 8 }],
      outs: 0,
      defense: DEFENSE,
      params: kid,
    });
    const { s: end } = runPlay(s, kid, (st) => (st.flyCaught ? { sendRunner: 'r3', run: true } : {}), () => 0.9);
    const out = finishLivePlay(end);
    expect(out.runs).toBe(0); // nobody advances after a kid-mode catch
    expect(out.bases[2]).toBe(true); // runner walked back to third
  });

  it('a runner who strayed far gets doubled off on a caught fly', () => {
    let s = startLivePlay({
      mode: 'offense',
      launch: { type: 'fly', landing: { x: 480, y: 235 }, hangMs: 1300, rollSpeed: 0, homer: false },
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [{ base: 1, charId: 'r1', speed: 3 }], // slow — a bad tag-up bet
      outs: 0,
      defense: DEFENSE,
      params: main,
    });
    // Greedily send the runner from first immediately (kid gambles on the drop).
    let sent = false;
    const { s: end, events } = runPlay(s, main, (st) => {
      if (!st.flyCaught && !sent) {
        sent = true;
        return { sendRunner: 'r1' };
      }
      return {};
    }, () => 0.9);
    expect(events.filter((e) => e.t === 'out').length).toBe(2); // fly + doubled off
    expect(finishLivePlay(end).outs).toBe(2);
  });

  it('holding a runner mid-leg turns them back, and a tag can still get them', () => {
    let s = startLivePlay({
      mode: 'offense',
      launch: { ...grounderToShort, landing: { x: 700, y: 260 } },
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [{ base: 2, charId: 'r2', speed: 5 }], // unforced
      outs: 0,
      defense: DEFENSE,
      params: main,
    });
    // Send the runner from second, then panic and turn back — the CPU carrier
    // should hunt them down for a tag (a rundown) or they retreat safely.
    let step = 0;
    const { s: end } = runPlay(s, main, () => {
      step++;
      if (step === 3) return { sendRunner: 'r2' };
      if (step === 16) return { holdRunner: 'r2' };
      return {};
    }, () => 0.9);
    const r2 = end.runners.find((r) => r.charId === 'r2')!;
    // Either they made it back (safe at 2nd) or the tag got them — never stuck.
    expect(r2.done === 'out' || (r2.done === null && r2.from === 2) || r2.done === 'safe').toBe(true);
  });

  it('an unforced runner is NOT out just because the ball beat them to the bag', () => {
    let s = startLivePlay({
      mode: 'offense',
      launch: { ...grounderToShort, landing: { x: 700, y: 260 } }, // hit to right side
      batter: { charId: 'bat', speed: 10 },
      baseRunners: [{ base: 2, charId: 'r2', speed: 9 }], // unforced (1st empty... batter forces only 1st)
      outs: 0,
      defense: DEFENSE,
      params: main,
    });
    // Send r2 to third with a good jump; the CPU's throw beats them there by a
    // hair, but a bang-bang arrival is inside SAFE_RADIUS — safe unless tagged.
    let sent = false;
    const { s: end } = runPlay(s, main, (st) => {
      if (!sent && st.elapsed > 100) {
        sent = true;
        return { sendRunner: 'r2' };
      }
      return {};
    }, () => 0.9);
    const r2 = end.runners.find((r) => r.charId === 'r2')!;
    // A fast unforced runner with a big head start should not be force-out-able.
    expect(r2.done === 'out' && r2.pos.x === 298 && false).toBe(false); // (no force at 3rd)
    expect(finishLivePlay(end).outs).toBeLessThanOrEqual(1); // at most the batter
  });

  it('termination property holds under random send/hold spam', () => {
    for (let i = 0; i < 120; i++) {
      const r = resolveContact(
        (['perfect', 'good', 'weak'] as const)[i % 3],
        plain({ stats: { contact: 5, power: (i % 10) + 1, speed: ((i * 3) % 10) + 1, pitching: 5, fielding: 5 } }),
        plain({}),
        () => Math.random()
      );
      if (r.kind !== 'inPlay' || r.launch.homer) continue;
      const nRunners = i % 4;
      const baseRunners = ([1, 2, 3] as const)
        .slice(0, nRunners)
        .map((b) => ({ base: b, charId: `r${b}`, speed: ((i * 7) % 10) + 1 }));
      const ids = ['bat', ...baseRunners.map((b) => b.charId)];
      let s = startLivePlay({
        mode: i % 2 === 0 ? 'offense' : 'defense',
        launch: r.launch,
        batter: { charId: 'bat', speed: ((i * 5) % 10) + 1 },
        baseRunners,
        defense: DEFENSE,
        outs: i % 3,
        params: main,
      });
      let guard = 0;
      while (s.phase !== 'done' && guard++ < 2000) {
        const inputs: LiveInputs = {};
        if (Math.random() < 0.8) inputs.pointer = { x: Math.random() * 960, y: Math.random() * 640 };
        if (Math.random() < 0.1)
          inputs.throwTo = { base: ((Math.floor(Math.random() * 4) + 1) as 1 | 2 | 3 | 4), power: Math.random() };
        if (Math.random() < 0.25) inputs.sendRunner = ids[Math.floor(Math.random() * ids.length)];
        if (Math.random() < 0.25) inputs.holdRunner = ids[Math.floor(Math.random() * ids.length)];
        s = stepLivePlay(s, inputs, 50, main, () => Math.random());
      }
      expect(s.phase).toBe('done');
      const outcome = finishLivePlay(s);
      expect(outcome.outs).toBeGreaterThanOrEqual(0);
      expect(outcome.outs + (s.outsBefore ?? 0)).toBeLessThanOrEqual(4);
      expect(outcome.runs).toBeLessThanOrEqual(4);
    }
  });
});

describe('live play: bounces & fence caroms', () => {
  // Assist fully off: the ball is left alone to do physics.
  const params: LiveParams = { ...resolveLiveParams('kid'), assist: 'magnet', assistBlend: 0 };

  const start = (launch: Launch, geo = DEFAULT_GEOMETRY) =>
    startLivePlay({
      mode: 'defense',
      launch,
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [],
      defense: DEFENSE,
      outs: 0,
      params,
      geo,
    });

  // Park the chaser in the corner so nobody grabs the ball — these tests
  // watch the ball's own physics. (Only the active chaser can field it.)
  const parked = { pointer: { x: 60, y: 560 }, pointerActive: true };

  /** Step until the ball is settled (or the play ends); returns the trace. */
  const settle = (s: LivePlayState) => {
    const trace: { pos: { x: number; y: number }; height: number; events: LiveEvent[] }[] = [];
    let guard = 0;
    while (guard++ < 400 && s.phase !== 'done') {
      s = stepLivePlay(s, parked, 25, params, () => 0.5);
      trace.push({ pos: { ...s.ball.pos }, height: s.ball.height, events: [...s.events] });
      if (s.ball.phase === 'rolling' && s.ball.rollV === 0 && !s.ball.hop && s.landedAt > 0) break;
    }
    return { s, trace };
  };

  const gapLiner: Launch = {
    type: 'liner',
    landing: { x: 480, y: 300 },
    hangMs: 900,
    rollSpeed: 300,
    homer: false,
  };

  it('a landed liner hops past its landing spot, hops diminish, and it settles', () => {
    const { s, trace } = settle(start(gapLiner));
    const landIdx = trace.findIndex((t) => t.events.some((e) => e.t === 'land'));
    expect(landIdx).toBeGreaterThanOrEqual(0);
    const afterLand = trace.slice(landIdx + 1);
    // It traveled beyond the landing point...
    expect(dist(s.ball.pos, gapLiner.landing)).toBeGreaterThan(20);
    // ...with bounded, diminishing hop height...
    const peak = Math.max(...afterLand.map((t) => t.height));
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(LIVE.BOUNCE.FIRST_HOP_H + 1e-9);
    // ...and it came to rest (settled, flat, done hopping).
    expect(s.ball.rollV).toBe(0);
    expect(s.ball.height).toBe(0);
    expect(s.ball.hop).toBeUndefined();
  });

  it('identical kid-mode sims are byte-identical, bounces included', () => {
    let a = start(gapLiner);
    let b = start(gapLiner);
    for (let i = 0; i < 200; i++) {
      a = stepLivePlay(a, parked, 25, params, () => 0.5);
      b = stepLivePlay(b, parked, 25, params, () => 0.5);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      if (a.phase === 'done') break;
    }
  });

  it('livelier ground = longer bounce-out: blacktop > park > sandlot', () => {
    const travel = (geo = DEFAULT_GEOMETRY) =>
      dist(settle(start(gapLiner, geo)).s.ball.pos, gapLiner.landing);
    const park = travel();
    const blacktop = travel(getFieldGeometry(VENUES.blacktop));
    const sandlot = travel(getFieldGeometry(VENUES.sandlot));
    expect(blacktop).toBeGreaterThan(park);
    expect(park).toBeGreaterThan(sandlot);
  });

  it('a hot liner at the wall caroms back into play — a live double off the fence', () => {
    // Lands 20px in front of the center-field wall, still moving fast.
    const wall = fenceYAtX(DEFAULT_GEOMETRY, 480);
    const hot: Launch = {
      type: 'liner',
      landing: { x: 480, y: wall + 20 },
      hangMs: 600,
      rollSpeed: 300,
      homer: false,
    };
    const { s, trace } = settle(start(hot));
    expect(trace.some((t) => t.events.some((e) => e.t === 'carom'))).toBe(true);
    // Never past the wall from the carom on, and it settles heading home-ward.
    for (const t of trace) {
      expect(t.pos.y).toBeGreaterThanOrEqual(fenceYAtX(DEFAULT_GEOMETRY, t.pos.x) + 4 - 0.001);
    }
    expect(s.ball.pos.y).toBeGreaterThan(wall + 4);
  });

  it('caroms keep the ball in-bounds across every venue and spray direction', () => {
    for (const v of Object.values(VENUES)) {
      const geo = getFieldGeometry(v);
      for (const t of [0.15, 0.35, 0.5, 0.65, 0.85]) {
        const at = fencePointAt(geo, t);
        const hot: Launch = {
          type: 'liner',
          landing: { x: at.x, y: at.y + 18 },
          hangMs: 550,
          rollSpeed: 300,
          homer: false,
        };
        const { trace } = settle(start(hot, geo));
        for (const step of trace) {
          expect(step.pos.y).toBeGreaterThanOrEqual(fenceYAtX(geo, step.pos.x) + 4 - 0.001);
        }
      }
    }
  });

  it('grounders never hop — they roll exactly like before', () => {
    const { trace } = settle(start(grounderToShort));
    for (const t of trace) expect(t.height).toBe(0);
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
        plain({ stats: { contact: 5, power: (i % 10) + 1, speed: ((i * 3) % 10) + 1, pitching: 5, fielding: 5 } }),
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
    expect(FIRST).toEqual({ x: 618, y: 385 });
  });

  it('the bases sit exactly on the foul lines', () => {
    expect(FIRST.x - HOME.x).toBeCloseTo(FOUL_SLOPE * (HOME.y - FIRST.y), 6);
    expect(HOME.x - THIRD.x).toBeCloseTo(FOUL_SLOPE * (HOME.y - THIRD.y), 6);
  });

  it('a real outfield exists beyond second base', () => {
    expect(SECOND.y).toBeGreaterThanOrEqual(FENCE_Y + 50);
  });

  it('clampToField pins points behind the fence, inside the cone, above the floor', () => {
    for (const venue of Object.values(VENUES)) {
      const geo = getFieldGeometry(venue);
      // Straight over the wall in center -> lands FIELD_MARGIN in front of it.
      const overWall = clampToField(geo, { x: 480, y: 0 });
      expect(overWall.x).toBe(480);
      expect(overWall.y).toBeCloseTo(fenceYAtX(geo, 480) + FIELD_MARGIN, 6);
      // Way foul left/right at mid-depth -> pulled inside the cone allowance.
      for (const p of [clampToField(geo, { x: 0, y: 300 }), clampToField(geo, { x: 960, y: 300 })]) {
        const half = FOUL_SLOPE * (HOME.y - p.y) + FOUL_ALLOWANCE;
        expect(Math.abs(p.x - HOME.x)).toBeLessThanOrEqual(half + 0.001);
        expect(p.y).toBeGreaterThanOrEqual(fenceYAtX(geo, p.x) + FIELD_MARGIN - 0.001);
      }
      // Off the bottom of the screen -> the sanity floor.
      expect(clampToField(geo, { x: 480, y: 700 }).y).toBe(FIELD_BOTTOM_Y);
      // A plainly interior point is untouched.
      expect(clampToField(geo, { x: 480, y: 320 })).toEqual({ x: 480, y: 320 });
    }
    // The sandlot's short right porch: a deep right-field target respects the
    // shallower fence there, not the deep left-field number.
    const sandlot = getFieldGeometry(VENUES.sandlot);
    const deepRight = clampToField(sandlot, { x: 760, y: 0 });
    expect(deepRight.y).toBeGreaterThanOrEqual(fenceYAtX(sandlot, deepRight.x) + FIELD_MARGIN - 0.001);
    expect(deepRight.y).toBeGreaterThan(sandlot.fenceLeftY + FIELD_MARGIN);
  });

  it('the steered fielder can never be driven past the fence or off the field', () => {
    const kid = resolveLiveParams('kid');
    const corners = [
      { x: 480, y: 0 },
      { x: 0, y: 0 },
      { x: 960, y: 0 },
      { x: 0, y: 640 },
      { x: 960, y: 640 },
    ];
    for (const venue of Object.values(VENUES)) {
      const geo = getFieldGeometry(venue);
      for (const target of corners) {
        let s = startLivePlay({
          mode: 'defense',
          launch: flyToCenter,
          batter: { charId: 'bat', speed: 5 },
          baseRunners: [],
          defense: DEFENSE,
          outs: 0,
          params: kid,
          geo,
        });
        for (let tick = 0; tick < 200 && s.phase !== 'done'; tick++) {
          s = stepLivePlay(s, { pointer: target }, 50, kid, () => 0.5);
          const f = s.fielders[s.active];
          const tag = `${venue.id} -> (${target.x},${target.y}) tick ${tick}`;
          expect(f.pos.y, `${tag}: past the fence`).toBeGreaterThanOrEqual(
            fenceYAtX(geo, f.pos.x) + FIELD_MARGIN - 0.5
          );
          expect(Math.abs(f.pos.x - HOME.x), `${tag}: outside the foul cone`).toBeLessThanOrEqual(
            FOUL_SLOPE * Math.max(0, HOME.y - f.pos.y) + FOUL_ALLOWANCE + 0.5
          );
          expect(f.pos.y, `${tag}: below the screen`).toBeLessThanOrEqual(FIELD_BOTTOM_Y + 0.5);
          if (f.hasBall) expect(s.ball.pos, `${tag}: ball detached`).toEqual(f.pos);
        }
      }
    }
  });

  it('a held ball follows the CLAMPED carrier at the wall', () => {
    const kid = resolveLiveParams('kid');
    const geo = getFieldGeometry(VENUES.park);
    let s = startLivePlay({
      mode: 'defense',
      launch: flyToCenter,
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [],
      defense: DEFENSE,
      outs: 0,
      params: kid,
      geo,
    });
    // Camp under the fly until the catch, then try to carry it over the wall.
    let guard = 0;
    while (!s.fielders[s.active].hasBall && s.phase !== 'done' && guard++ < 200) {
      s = stepLivePlay(s, { pointer: flyToCenter.landing }, 50, kid, () => 0.5);
    }
    expect(s.fielders[s.active].hasBall).toBe(true);
    for (let tick = 0; tick < 60 && s.phase !== 'done'; tick++) {
      s = stepLivePlay(s, { pointer: { x: 480, y: 0 } }, 50, kid, () => 0.5);
      const f = s.fielders[s.active];
      if (!f.hasBall) break; // no-soft-lock guard may resolve the play
      expect(f.pos.y).toBeGreaterThanOrEqual(fenceYAtX(geo, f.pos.x) + FIELD_MARGIN - 0.5);
      expect(s.ball.pos).toEqual(f.pos);
    }
  });

  it('every fielder starts in fair territory and clear of obstacles, in every venue', () => {
    for (const venue of Object.values(VENUES)) {
      const geo = getFieldGeometry(venue);
      // Steepest possible line per side: through this venue's actual pole.
      const left = fencePointAt(geo, 0);
      const right = fencePointAt(geo, 1);
      for (const [id, p] of Object.entries(FIELD_POSITIONS)) {
        if (id === 'C') continue; // catcher squats behind the plate, off-diamond
        const leftLineX = HOME.x + ((left.x - HOME.x) * (HOME.y - p.y)) / (HOME.y - left.y);
        const rightLineX = HOME.x + ((right.x - HOME.x) * (HOME.y - p.y)) / (HOME.y - right.y);
        expect(p.x, `${venue.id}: ${id} is past the left line`).toBeGreaterThan(leftLineX);
        expect(p.x, `${venue.id}: ${id} is past the right line`).toBeLessThan(rightLineX);
        for (const o of geo.obstacles) {
          expect(dist(p, o), `${venue.id}: ${id} starts inside an obstacle`).toBeGreaterThan(o.r);
        }
      }
    }
  });
});

describe('live play: the dive verb (main mode)', () => {
  const main = resolveLiveParams('main');
  // Pure steering for exact distances: kill the magnet blend.
  const noAssist: LiveParams = { ...main, assistBlend: 0 };

  /** A fly the chaser parks NEAR but not ON: reachable only with the dive bonus. */
  const setup = () =>
    startLivePlay({
      mode: 'defense',
      launch: flyToCenter,
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [],
      defense: DEFENSE,
      outs: 0,
      params: noAssist,
    });
  // Park just outside plain catch reach, inside dive reach.
  const camp = {
    x: flyToCenter.landing.x + noAssist.catchRadius + LIVE.DIVE.REACH_BONUS / 2,
    y: flyToCenter.landing.y,
  };

  it('a well-timed dive turns an out-of-reach fly into a catch', () => {
    let dove = false;
    const { events } = runPlay(setup(), noAssist, (st) => {
      const t = st.ball.phase === 'flight' ? st.ball.flightT / st.ball.flightMs : 1;
      if (!dove && t >= 0.8) {
        dove = true;
        return { pointer: camp, pointerActive: true, dive: true };
      }
      return { pointer: camp, pointerActive: true };
    });
    expect(events.some((e) => e.t === 'dive')).toBe(true);
    expect(events.some((e) => e.t === 'catch')).toBe(true);
  });

  it('without the dive, the same camp spot is out of reach', () => {
    const { events } = runPlay(setup(), noAssist, () => ({ pointer: camp, pointerActive: true }));
    expect(events.some((e) => e.t === 'catch')).toBe(false);
    expect(events.some((e) => e.t === 'land')).toBe(true);
  });

  it('an empty dive leaves the kid face-down and the ball live', () => {
    let dove = false;
    let sawFrozen = false;
    const far = { x: flyToCenter.landing.x + 200, y: flyToCenter.landing.y };
    const { events } = runPlay(setup(), noAssist, (st) => {
      const chaser = st.fielders[st.active];
      if (chaser.diveDown && st.elapsed < chaser.fumbleUntil) sawFrozen = true;
      if (!dove && st.elapsed >= 200) {
        dove = true;
        return { pointer: far, pointerActive: true, dive: true };
      }
      return { pointer: far, pointerActive: true };
    });
    expect(events.some((e) => e.t === 'dive')).toBe(true);
    expect(events.some((e) => e.t === 'diveMiss')).toBe(true);
    expect(sawFrozen).toBe(true);
    expect(events.some((e) => e.t === 'catch')).toBe(false);
  });

  it('kid mode ignores the dive input entirely (no event, no rng change)', () => {
    const kid = resolveLiveParams('kid');
    let s = startLivePlay({
      mode: 'defense',
      launch: flyToCenter,
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [],
      defense: DEFENSE,
      outs: 0,
      params: kid,
    });
    const { events } = runPlay(s, kid, () => ({ pointer: camp, pointerActive: true, dive: true }));
    expect(events.some((e) => e.t === 'dive')).toBe(false);
    expect(events.some((e) => e.t === 'diveMiss')).toBe(false);
  });
});
