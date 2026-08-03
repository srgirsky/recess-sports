// ---------------------------------------------------------------------------
// The stolen base, checked as a RACE rather than against a rate.
//
// Every assertion here is falsifiable without a published band, which is the
// standard `sim.harnessMethod` sets for the ordering gates: speed helps, arm
// hurts, a slow pitch helps the runner, and none of it is stated anywhere as a
// probability. The one thing that IS a level — how often steals happen — is
// deliberately not asserted here; it is `sim.stealRace`'s to record, because it
// is a consequence of the unmeasured arm band and not of this file.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  catcherOf,
  cpuWantsSteal,
  jumpSigmaSec,
  projectedMarginSec,
  runnerSecTo,
  stealRace,
  throwSecTo,
} from './steal';
import { RUN } from './params';
import { makeRng } from './rng';
import { planDefence } from './lineup';
import { ROSTER, getCharacter } from '../../data/characters';

/** A kid whose stat is closest to `v`, so the sweeps use REAL characters. */
const bySpeed = (v: number) =>
  ROSTER.reduce((b, c) => (Math.abs(c.stats.speed - v) < Math.abs(b.stats.speed - v) ? c : b));
const byArm = (v: number) =>
  ROSTER.reduce((b, c) =>
    Math.abs(c.stats.pitching - v) < Math.abs(b.stats.pitching - v) ? c : b
  );

const spec = (speed: number, arm: number, pitchTravelSec = 1.02) => ({
  runner: bySpeed(speed),
  catcher: byArm(arm),
  to: 2 as const,
  pitchTravelSec,
});

const FREE = { outs: 0, nextBagOccupied: false };

describe('★ the steal is a race, and the terms are real quantities', () => {
  it('★ is DEGENERATE without a lead — the trap the model exists to avoid', () => {
    // Raced from a standing start ON the bag, the runner covers the whole
    // basepath while the catcher only waits out the pitch. `sim.stealRace`
    // records the measurement: he loses to any arm that can reach second by
    // 1.1-2.4s and beats any arm that cannot, so nobody would ever steal and no
    // tuning would fix it — the SHAPE is wrong, not the level.
    expect(RUN.LEAD_FT).toBeGreaterThan(0);
    const withLead = projectedMarginSec(spec(9, 7));
    // Recompute the no-lead case by hand rather than by mutating the constant.
    const s = spec(9, 7);
    const d = throwSecTo(s)!;
    const noLeadLeg = runnerSecTo(s) + RUN.LEAD_FT / 14; // ~the extra ground, generously
    expect(d - noLeadLeg).toBeLessThan(withLead);
  });

  it('★ speed helps and the arm hurts, monotonically', () => {
    // No band needed: these are true of baseball and of any model worth having.
    for (const arm of [5, 7, 9]) {
      let prev = -Infinity;
      for (const speed of [3, 5, 7, 9]) {
        const m = projectedMarginSec(spec(speed, arm));
        expect(m, `arm ${arm}, speed ${speed}`).toBeGreaterThan(prev);
        prev = m;
      }
    }
    for (const speed of [3, 5, 7, 9]) {
      let prev = Infinity;
      for (const arm of [5, 7, 9]) {
        const m = projectedMarginSec(spec(speed, arm));
        expect(m, `speed ${speed}, arm ${arm}`).toBeLessThan(prev);
        prev = m;
      }
    }
  });

  it('★ gives a better jump off slow stuff, with NO constant saying so', () => {
    // v1 adds a flat +0.12 for a changeup or curve. Here it falls out of the
    // pitch's own flight time, because the catcher cannot start until the ball
    // reaches him. The advantage must equal the flight difference exactly.
    const fast = projectedMarginSec(spec(5, 7, 1.02));
    const slow = projectedMarginSec(spec(5, 7, 1.33));
    expect(slow - fast).toBeCloseTo(1.33 - 1.02, 9);
    // And it is enough to flip a real outcome, not just to nudge one.
    expect(fast).toBeLessThan(0);
    expect(slow).toBeGreaterThan(0);
  });

  it('an arm that cannot reach the bag does not throw', () => {
    // `throwFlightSec` returns null out of range, which is a real outcome:
    // only 14 of 30 kids can make the 90ft to second (`sim.stealRace`).
    const weak = spec(5, 1);
    expect(throwSecTo(weak)).toBeNull();
    expect(projectedMarginSec(weak)).toBe(Infinity);
    expect(stealRace(weak, makeRng('x')).outOfRange).toBe(true);
  });
});

describe('★ the jump is the only randomness', () => {
  it('can beat a fast runner and carry a slow one', () => {
    // The point of an error in TIME rather than a coin weighted by the outcome.
    const tight = spec(9, 9); // a near-tie
    const outcomes = new Set<boolean>();
    for (let i = 0; i < 200; i++) outcomes.add(stealRace(tight, makeRng(`j${i}`)).safe);
    expect(outcomes.size, 'a near-tie must go both ways').toBe(2);
  });

  it('gives a better baserunner a smaller error', () => {
    expect(jumpSigmaSec(10)).toBeLessThan(jumpSigmaSec(1));
    expect(jumpSigmaSec(5)).toBeLessThan(jumpSigmaSec(1));
  });

  it('is deterministic for a given seed', () => {
    const a = stealRace(spec(7, 7), makeRng('same'));
    const b = stealRace(spec(7, 7), makeRng('same'));
    expect(a).toEqual(b);
  });
});

describe('★ the decision is situational, not a frequency', () => {
  it('★ has no attempt-rate or success-rate constant to tune', () => {
    // The `sim.plateDiscipline` check, pointed at baserunning: a name that looks
    // like an outcome knob is the thing this model exists to not have.
    for (const k of Object.keys(RUN)) {
      expect(/RATE|CHANCE|PROB|ATTEMPT|SUCCESS/.test(k), `RUN.${k} looks like an outcome knob`).toBe(
        false
      );
    }
  });

  it('★ holds with two outs, because the out ends the inning', () => {
    const s = spec(9, 5); // comfortably winnable
    expect(cpuWantsSteal(s, FREE)).toBe(true);
    expect(cpuWantsSteal(s, { outs: 2, nextBagOccupied: false })).toBe(false);
  });

  it('★ takes second freely but third only when nearly free', () => {
    // Second is scoring position; from second, third adds almost nothing while
    // the out costs the same.
    //
    // ★ CONSTRUCTED ONTO THE BAND, NOT SWEPT FOR IT. Two earlier versions were
    // vacuous and the gate sweep caught both: one guarded the assertion behind
    // "if the roster happens to produce a marginal case", and the next swept the
    // roster but counted cases where third was declined because its margin was
    // NEGATIVE — the throw to third is shorter than the throw to second, so that
    // is the common reason and it has nothing to do with the rule. The rule only
    // bites in `0 < margin < STEAL_THIRD_MARGIN_SEC`, so the test puts the
    // margin there on purpose by choosing the pitch's flight time.
    const base = { runner: bySpeed(7), catcher: byArm(7), to: 3 as const };
    const at = (marginWanted: number) => {
      // `projectedMarginSec` is linear in `pitchTravelSec`, so one probe solves it.
      const probe = { ...base, pitchTravelSec: 1 };
      const m0 = projectedMarginSec(probe);
      return { ...base, pitchTravelSec: 1 + (marginWanted - m0) };
    };
    const thin = at(RUN.STEAL_THIRD_MARGIN_SEC * 0.5);
    const fat = at(RUN.STEAL_THIRD_MARGIN_SEC * 1.8);
    expect(projectedMarginSec(thin)).toBeGreaterThan(0);
    expect(projectedMarginSec(thin)).toBeLessThan(RUN.STEAL_THIRD_MARGIN_SEC);
    expect(projectedMarginSec(fat)).toBeGreaterThan(RUN.STEAL_THIRD_MARGIN_SEC);

    // A winnable-but-thin race to third is declined; the same margin to second
    // is taken. That is the whole rule.
    expect(cpuWantsSteal(thin, FREE), 'thin margin to third must be declined').toBe(false);
    expect(cpuWantsSteal(fat, FREE), 'a clear margin to third is taken').toBe(true);
    expect(cpuWantsSteal({ ...thin, to: 2 }, FREE), 'the same margin to second is taken').toBe(true);
  });

  it('never steals into an occupied bag', () => {
    expect(cpuWantsSteal(spec(10, 1), { outs: 0, nextBagOccupied: true })).toBe(false);
  });

  it('never goes when he projects to lose', () => {
    const s = spec(2, 10);
    expect(projectedMarginSec(s)).toBeLessThan(0);
    expect(cpuWantsSteal(s, FREE)).toBe(false);
  });
});

describe('the catcher comes out of the defence plan', () => {
  it('finds him, and there is always one', () => {
    const ids = ROSTER.slice(0, 9).map((c) => c.id);
    const plan = planDefence(ids, getCharacter);
    const c = catcherOf(plan.positions, getCharacter);
    expect(c).toBeTruthy();
    expect(plan.positions[c!.id]).toBe('C');
  });
});
