// ---------------------------------------------------------------------------
// The runner is checked against two things that are true independently of it:
// the CLOSED FORM for constant acceleration to a capped speed, which the
// integrator must reproduce and which nothing here is free to redefine, and the
// measurement in `pace.homeToFirst` — 4200ms over 60ft, n=3, the anchor every
// other pace constant in the project is derived against.
//
// The two guards in `reverseLeg` and `settleBase` are pinned deterministically.
// v1 found both stochastically, through a random send/hold property test, and
// only after slower fielders made long plays common enough to reach them.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  makeRunner,
  runnerPos,
  remainingFt,
  startLeg,
  stepRunner,
  reverseLeg,
  startRetreatLeg,
  settleBase,
  settleRunner,
  mayBeSent,
  mayReverse,
  type Base,
  type RunnerState,
} from './runners';
import {
  reachFt,
  sprintAccelFtS2,
  sprintAccelSec,
  sprintTimeSec,
  sprintTopSpeedFts,
} from './athletes';
import { RUN, BOUNCE, DEFENSE } from './params';
import { BASEPATH, FIELD_MARGIN, FIRST, HOME, dist } from './field';
import { ftsToMph } from './units';
import { ROSTER } from '../../data/characters';

const TICK = 1 / 240;

/** A kid with a given speed stat, or the first on the roster. */
function kid(speed: number) {
  return ROSTER.find((c) => c.stats.speed === speed) ?? { ...ROSTER[0], stats: { ...ROSTER[0].stats, speed } };
}

/** Run a leg to its end and report how long it took, seconds. */
function legSec(r: RunnerState, to: Base, dt = TICK): number {
  startLeg(r, to);
  let t = 0;
  while (t < 30) {
    t += dt;
    if (stepRunner(r, dt, t) === 'arrived') return t;
  }
  return Infinity;
}

describe('the sprint model', () => {
  it('★ reproduces pace.homeToFirst, which is what determines the acceleration', () => {
    // 4200ms over 60ft, n=3, spread 261, confidence med. The record calls it
    // "THE anchor: every other pace constant is measured against it".
    const r = makeRunner(kid(5), 0);
    const t = legSec(r, 1);
    expect(t * 1000, 'the anchored kid runs the measured leg').toBeGreaterThan(4200 - 261);
    expect(t * 1000).toBeLessThan(4200 + 261);
    // And tightly, because the acceleration was SOLVED from it: a tick either
    // way, not a band.
    expect(t).toBeCloseTo(RUN.HOME_TO_FIRST_SEC, 2);
  });

  it('★ agrees with the closed form, so the integrator is checked against maths', () => {
    // An integrator checked only against itself is checked against nothing.
    for (const speed of [1, 3, 5, 8, 10]) {
      const r = makeRunner(kid(5), 0);
      r.topFts = sprintTopSpeedFts(speed);
      r.accelFtS2 = sprintAccelFtS2(speed);
      const t = legSec(r, 1);
      expect(t, `speed ${speed}`).toBeCloseTo(sprintTimeSec(BASEPATH, speed), 2);
    }
  });

  it('leaves the acceleration with no freedom in it', () => {
    // T = 2*(t_measured - d/V). Recomputed here from the two inputs, not read
    // back out of the code that used them.
    const v = sprintTopSpeedFts(RUN.ANCHOR_SPEED_STAT);
    expect(sprintAccelSec()).toBeCloseTo(2 * (RUN.HOME_TO_FIRST_SEC - BASEPATH / v), 10);
    // And the consequence is a plausible child, which is the independent check:
    // ~10 ft/s² of acceleration, up to speed in under two seconds, inside the
    // first quarter of the basepath.
    expect(sprintAccelFtS2(5)).toBeGreaterThan(8);
    expect(sprintAccelFtS2(5)).toBeLessThan(13);
    expect(sprintAccelSec()).toBeGreaterThan(1.2);
    expect(sprintAccelSec()).toBeLessThan(2.2);
    const rampFt = (v * v) / (2 * sprintAccelFtS2(5));
    expect(rampFt).toBeLessThan(BASEPATH / 2);
  });

  it('keeps every kid on the roster inside the published youth band', () => {
    // Published peak sprint velocity for 7-9 year olds is about 5.0-5.8 m/s
    // (16.4-19.0 ft/s); the roster's spread runs a little either side of it,
    // which is what a stat is for.
    for (const c of ROSTER) {
      const mph = ftsToMph(sprintTopSpeedFts(c.stats.speed));
      expect(mph, `${c.name} tops out at ${mph.toFixed(1)} mph`).toBeGreaterThan(10);
      expect(mph, `${c.name} tops out at ${mph.toFixed(1)} mph`).toBeLessThan(16);
    }
  });

  it('is monotone in the stat and clamps a content typo', () => {
    for (let s = 1; s < 10; s++) {
      expect(sprintTopSpeedFts(s + 1)).toBeGreaterThan(sprintTopSpeedFts(s));
      expect(sprintTimeSec(BASEPATH, s + 1)).toBeLessThan(sprintTimeSec(BASEPATH, s));
    }
    expect(sprintTopSpeedFts(-4)).toBe(sprintTopSpeedFts(1));
    expect(sprintTopSpeedFts(99)).toBe(sprintTopSpeedFts(10));
  });

  it('starts from a standing start, which is the whole difference from v1', () => {
    const r = makeRunner(kid(5), 0);
    startLeg(r, 1);
    expect(r.speedFts).toBe(0);
    stepRunner(r, TICK, TICK);
    // v1 would already be at 14.29 ft/s here.
    expect(r.speedFts).toBeLessThan(1);
    // The first tenth of a second covers far less than a flat model would.
    let t = TICK;
    while (t < 0.1) {
      t += TICK;
      stepRunner(r, TICK, t);
    }
    expect(r.alongFt).toBeLessThan(0.1 * 14.29);
  });

  it('is independent of the tick rate', () => {
    for (const hz of [60, 120, 240, 480]) {
      const r = makeRunner(kid(5), 0);
      expect(legSec(r, 1, 1 / hz), `${hz} Hz`).toBeCloseTo(RUN.HOME_TO_FIRST_SEC, 1);
    }
  });
});

describe('legs', () => {
  it('walks the runner along the real basepath', () => {
    const r = makeRunner(kid(5), 0);
    startLeg(r, 1);
    expect(r.legFt).toBeCloseTo(BASEPATH, 6);
    expect(runnerPos(r)).toEqual(HOME);
    let t = 0;
    while (t < 2) {
      t += TICK;
      stepRunner(r, TICK, t);
    }
    const p = runnerPos(r);
    expect(dist(HOME, p)).toBeGreaterThan(0);
    expect(dist(HOME, p) + dist(p, FIRST)).toBeCloseTo(BASEPATH, 6);
    expect(remainingFt(r)).toBeCloseTo(BASEPATH - r.alongFt, 6);
  });

  it('keeps momentum through a bag and loses it standing on one', () => {
    // A kid who rounds first and keeps going does not stop and restart: the
    // arrival tick hands the policy a runner who is still moving.
    const r = makeRunner(kid(5), 0);
    legSec(r, 1);
    const rounding = r.speedFts;
    expect(rounding).toBeGreaterThan(15);
    startLeg(r, 2);
    expect(r.speedFts).toBe(rounding);

    // One who is not sent has pulled up, and a kid standing on a bag is
    // standing still — so their next leg starts from zero like anyone else's.
    const s = makeRunner(kid(5), 0);
    legSec(s, 1);
    stepRunner(s, TICK, 99);
    expect(s.speedFts).toBe(0);
    startLeg(s, 2);
    expect(s.speedFts).toBe(0);
  });

  it('scores a runner who reaches home', () => {
    const r = makeRunner(kid(5), 3);
    legSec(r, 4);
    expect(r.done).toBe('scored');
  });

  it('holds a runner on the bag for the dwell beat', () => {
    const r = makeRunner(kid(5), 1, 10);
    expect(mayBeSent(r, 10)).toBe(false);
    expect(mayBeSent(r, 10 + RUN.BASE_DWELL_SEC)).toBe(true);
    startLeg(r, 2);
    expect(mayBeSent(r, 100), 'a runner already going is not "sent"').toBe(false);
  });
});

describe('★ the two bugs slower fielders exposed, pinned deterministically', () => {
  it('refuses to turn a batter-runner back toward the plate', () => {
    // defense.fielderSpeed.exposed. Without the `from <= 0` guard the rundown
    // rule turns the batter toward home, and since a batter at base 0 is FORCED
    // they get re-sent to first the moment they touch it: a flip-flop, plus a
    // runner who can end the play at base 0 and vanish from the inning.
    const r = makeRunner(kid(5), 0);
    startLeg(r, 1);
    stepRunner(r, 1, 1);
    expect(reverseLeg(r, 1), 'the batter-runner may not turn back').toBe(false);
    expect(r.from).toBe(0);
    expect(r.to).toBe(1);
    // The settled twin of the same guard.
    const s = makeRunner(kid(5), 0);
    expect(startRetreatLeg(s), 'and may not retreat to the box either').toBe(false);
  });

  it('turns a real runner around, and it costs them the speed', () => {
    const r = makeRunner(kid(5), 1);
    startLeg(r, 2);
    let t = 0;
    while (t < 1.5) {
      t += TICK;
      stepRunner(r, TICK, t);
    }
    const before = r.alongFt;
    expect(r.speedFts).toBeGreaterThan(10);
    expect(reverseLeg(r, t)).toBe(true);
    expect(r.from).toBe(2);
    expect(r.to).toBe(1);
    // Same point on the field, opposite direction, from a dead stop.
    expect(r.alongFt).toBeCloseTo(r.legFt - before, 6);
    expect(r.speedFts, 'you have to stop to turn around').toBe(0);
    expect(mayReverse(r, t)).toBe(false);
    expect(mayReverse(r, t + RUN.REVERSE_COOLDOWN_SEC + 1e-9)).toBe(true);
  });

  it('★ settles a straggler on min(from, to), never on `from`', () => {
    // The one-line bug. `reverseLeg` SWAPS the pair, so a runner turned back
    // from the plate carries from === 4 while running toward third, having
    // never touched home. Settling them on `from` put a live runner on base 4:
    // no run scored, and the fold back into the inning writes bases[3] on a
    // three-element tuple, so the runner silently vanished from the game.
    const r = makeRunner(kid(5), 3);
    startLeg(r, 4);
    stepRunner(r, 1, 1);
    reverseLeg(r, 1);
    expect(r.from, 'this is the state that made the bug reachable').toBe(4);
    expect(settleBase(r)).toBe(3);
    settleRunner(r);
    expect(r.from).toBe(3);
    expect(r.to).toBe(3);
    expect(r.done, 'and they are still live, not scored').toBeNull();
  });

  it('★ and min(from, to) is doing work the CLAMP cannot do', () => {
    // The 4-and-heading-back case above is the one v1 reported, but the 1..3
    // clamp alone would rescue it — 4 clamps to 3 whichever field is read. The
    // rule only shows its teeth in the middle of the diamond: a runner who left
    // SECOND for third and was turned around carries from === 3 having never
    // touched it, and reading `from` hands them a base they did not reach.
    const r = makeRunner(kid(5), 2);
    startLeg(r, 3);
    stepRunner(r, 1, 1);
    reverseLeg(r, 1);
    expect(r.from, 'reverseLeg swapped the pair').toBe(3);
    expect(r.to).toBe(2);
    expect(settleBase(r), 'behind them is SECOND, which is where they came from').toBe(2);
    settleRunner(r);
    expect(r.from).toBe(2);
  });

  it('settles a batter-runner on first, because a whole play went by', () => {
    const r = makeRunner(kid(5), 0);
    startLeg(r, 1);
    stepRunner(r, 0.5, 0.5);
    expect(settleBase(r)).toBe(1);
  });

  it('never settles anyone outside 1..3, from any live leg', () => {
    // The clamp at both ends, swept rather than sampled.
    for (const from of [0, 1, 2, 3] as Base[]) {
      const to = (from + 1) as Base;
      const r = makeRunner(kid(5), from);
      startLeg(r, to);
      stepRunner(r, 0.3, 0.3);
      const settled = settleBase(r);
      expect(settled, `${from}->${to}`).toBeGreaterThanOrEqual(1);
      expect(settled, `${from}->${to}`).toBeLessThanOrEqual(3);
      if (reverseLeg(r, 1)) {
        const back = settleBase(r);
        expect(back, `${to}->${from} reversed`).toBeGreaterThanOrEqual(1);
        expect(back, `${to}->${from} reversed`).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('★ the reach floor PR 3 asked PR 5 to cover', () => {
  it('lets a fielder reach a ball resting against the wall', () => {
    // bounce.test.ts has been asserting `FIELD_MARGIN - BALL_SETTLE_MARGIN_FT
    // <= 3` since PR 3, with the literal message "PR 5 catch radius must cover
    // this". This is the other end of that handshake, and it holds with nothing
    // to spare — which is why it is pinned from both sides rather than left to
    // be noticed when a ball became unreachable.
    const gap = FIELD_MARGIN - BOUNCE.BALL_SETTLE_MARGIN_FT;
    expect(reachFt()).toBeGreaterThanOrEqual(gap);
  });

  it('is a real child, not v1 s eleven-foot catch radius', () => {
    // LIVE.CATCH_RADIUS 34px / 2.99398 px-per-ft = 11.36ft, PICKUP_RADIUS
    // 28px = 9.35ft, and a dive added 30px = 10ft more for a 21.4ft diving
    // catch. Area goes as r², so v1 covered 14.3x the ground.
    const V1_CATCH_FT = 34 / (179.6386 / 60);
    expect(V1_CATCH_FT).toBeCloseTo(11.36, 2);
    expect((V1_CATCH_FT / reachFt()) ** 2).toBeGreaterThan(14);
    // And ours is a kid at full stretch: below their own height, above the wall
    // gap, and no more than a fifth of the way to the next base.
    expect(reachFt()).toBeLessThan(DEFENSE.REFERENCE_HEIGHT_FT);
    expect(reachFt()).toBeLessThan(BASEPATH / 5);
  });
});

describe('determinism', () => {
  it('gives bit-identical results across runs', () => {
    const run = () => {
      const out: number[] = [];
      for (const c of ROSTER.slice(0, 8)) {
        const r = makeRunner(c, 0);
        startLeg(r, 1);
        let t = 0;
        while (t < 3 && r.to !== r.from) {
          t += TICK;
          stepRunner(r, TICK, t);
          out.push(r.alongFt, r.speedFts);
        }
        reverseLeg(r, t);
        out.push(r.alongFt, r.speedFts, settleBase(r));
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
