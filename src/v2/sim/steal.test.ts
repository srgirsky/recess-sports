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
  throwLegsSec,
  throwSecTo,
  jumpSecOf,
  pickoffRace,
  pickoffThrowSec,
  projectedPickoffMarginSec,
  returnSec,
  setLeadFt,
} from './steal';
import { DEFENSE, RUN } from './params';
import { makeRng } from './rng';
import { reactionSec } from './athletes';
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

describe('★ the relay: a catcher who cannot reach the bag throws through the pitcher', () => {
  const weakest = ROSTER.reduce((b, c) => (c.stats.pitching < b.stats.pitching ? c : b));
  const strongest = ROSTER.reduce((b, c) => (c.stats.pitching > b.stats.pitching ? c : b));

  it('★ no catcher in the roster is out of range any more, with any pitcher behind him', () => {
    // The old shape: 16 of 30 catchers could not reach second, and against
    // them a steal had an INFINITE margin (`sim.stealRace`). With the mound
    // in the chain every arm reaches, so every margin is a number.
    let direct = 0;
    for (const catcher of ROSTER) {
      const s = { runner: bySpeed(5), catcher, pitcher: weakest, to: 2 as const, pitchTravelSec: 1.02 };
      const legs = throwLegsSec(s);
      expect(legs, `${catcher.name} has a route to second`).not.toBeNull();
      if (!legs!.relayed) direct++;
      expect(Number.isFinite(projectedMarginSec(s)), `${catcher.name}: a finite margin`).toBe(true);
      expect(stealRace(s, makeRng('r')).outOfRange).toBe(false);
    }
    expect(direct, 'some arms still reach on the fly').toBeGreaterThan(0);
    expect(direct, 'and some do not — the relay is exercised').toBeLessThan(ROSTER.length);
  });

  it('★ without a pitcher in the spec the old shape is kept: unreachable is a free steal', () => {
    const catcher = ROSTER.find((c) => throwLegsSec({ runner: bySpeed(5), catcher: c, to: 2, pitchTravelSec: 1 }) === null);
    expect(catcher, 'a catcher whose arm cannot reach second exists').toBeTruthy();
    const r = stealRace({ runner: bySpeed(5), catcher: catcher!, to: 2, pitchTravelSec: 1 }, makeRng('r'));
    expect(r.outOfRange).toBe(true);
    expect(r.safe).toBe(true);
    expect(r.marginSec).toBe(Infinity);
  });

  it('a relayed throw is slower than a direct one from the same arm would be', () => {
    // Compare a catcher who needs the relay against the strongest arm thrown
    // direct: the relay carries a second release and two flights.
    const relayed = ROSTER.find((c) => throwLegsSec({ runner: bySpeed(5), catcher: c, pitcher: strongest, to: 2, pitchTravelSec: 1 })?.relayed);
    expect(relayed).toBeTruthy();
    const viaMound = throwLegsSec({ runner: bySpeed(5), catcher: relayed!, pitcher: strongest, to: 2, pitchTravelSec: 1 })!;
    const direct = throwLegsSec({ runner: bySpeed(5), catcher: strongest, to: 2, pitchTravelSec: 1 })!;
    expect(viaMound.relayed).toBe(true);
    expect(direct.relayed).toBe(false);
    expect(viaMound.fly).toBeGreaterThan(direct.fly + DEFENSE.RELEASE_SEC);
  });
});

describe('★ a person’s read replaces the kid’s, and only the read', () => {
  it('a tap on arrival (readSec 0) tightens the race by exactly the catcher’s reaction', () => {
    const s = spec(6, 6);
    const own = stealRace(s, makeRng('same'));
    const read = stealRace({ ...s, readSec: 0 }, makeRng('same'));
    expect(read.marginSec).toBeLessThan(own.marginSec);
    expect(own.marginSec - read.marginSec).toBeCloseTo(reactionSec(s.catcher.stats.fielding), 9);
  });

  it('a late tap is a late read: worse than the kid, never clamped to his', () => {
    const s = spec(6, 6);
    const own = stealRace(s, makeRng('same'));
    const late = stealRace({ ...s, readSec: reactionSec(s.catcher.stats.fielding) + 0.4 }, makeRng('same'));
    expect(late.marginSec - own.marginSec).toBeCloseTo(0.4, 9);
  });
});

// ---------------------------------------------------------------------------
// The pickoff: raced, not rolled. `sim.pickoffRace` records the spread these
// orderings describe.
// ---------------------------------------------------------------------------

describe('★ the pickoff is a race, and the set lead is sized to the arm', () => {
  it('★ a set runner returns with exactly the margin to spare against every arm, so he is nearly never picked', () => {
    for (const r of ROSTER) {
      for (const p of ROSTER) {
        for (const base of [1, 2] as const) {
          const m = projectedPickoffMarginSec({ runner: r, pitcher: p, base, leaning: false });
          expect(m, `${r.id} vs ${p.id}`).toBeCloseTo(RUN.LEAD_RETURN_MARGIN_SEC, 6);
          const lead = setLeadFt(r, p, base);
          expect(lead).toBeGreaterThan(0);
          expect(lead).toBeLessThanOrEqual(RUN.LEAD_FT);
        }
      }
    }
  });

  it('★ the STEAL lead is not returnable against any roster arm — the degeneracy the set lead exists to avoid', () => {
    // Raced from the steal lead a set runner would simply be out, the way the
    // steal from a standing start was simply lost: at a kid's acceleration
    // ten feet takes longer to come back from than any arm takes to throw to
    // the bag. So the lead a runner holds when he is NOT going is solved
    // from the arm — a lead is by definition one you can return from.
    for (const r of ROSTER) {
      for (const p of ROSTER) {
        const t = pickoffThrowSec(p, 1)!;
        expect(t - returnSec(r, RUN.LEAD_FT, RUN.PICKOFF_READ_SEC)).toBeLessThan(RUN.LEAD_RETURN_MARGIN_SEC);
      }
    }
  });

  it('a faster runner holds a longer lead against the same arm; a stronger arm shortens it', () => {
    expect(setLeadFt(bySpeed(9), byArm(5), 1)).toBeGreaterThan(setLeadFt(bySpeed(2), byArm(5), 1));
    expect(setLeadFt(bySpeed(5), byArm(2), 1)).toBeGreaterThan(setLeadFt(bySpeed(5), byArm(9), 1));
  });

  it('★ a leaning runner is in a real race: usually out, closest for quick legs against a weak arm', () => {
    const quickVsWeak = projectedPickoffMarginSec({ runner: bySpeed(10), pitcher: byArm(1), base: 1, leaning: true });
    const slowVsStrong = projectedPickoffMarginSec({ runner: bySpeed(1), pitcher: byArm(10), base: 1, leaning: true });
    expect(slowVsStrong).toBeLessThan(quickVsWeak);
    expect(slowVsStrong).toBeLessThan(0);
    // Close enough that the jump (`jumpSigmaSec`, 0.08s for quick legs) decides it.
    expect(quickVsWeak).toBeGreaterThan(-0.2);
    // And always worse off than the same runner set on his sized lead.
    expect(quickVsWeak).toBeLessThan(
      projectedPickoffMarginSec({ runner: bySpeed(10), pitcher: byArm(1), base: 1, leaning: false })
    );
  });

  it('the read is the only draw, and it is the steal’s own jump', () => {
    const s = { runner: bySpeed(5), pitcher: byArm(5), base: 1 as const, leaning: false };
    const a = pickoffRace(s, makeRng('x'));
    expect(pickoffRace(s, makeRng('x'))).toEqual(a);
    expect(projectedPickoffMarginSec(s) - a.marginSec).toBeCloseTo(jumpSecOf(s.runner, makeRng('x')), 9);
    expect(a.leadFt).toBeCloseTo(setLeadFt(s.runner, s.pitcher, 1), 9);
  });

  it('second is the shorter throw from the mound', () => {
    expect(pickoffThrowSec(byArm(5), 2)!).toBeLessThan(pickoffThrowSec(byArm(5), 1)!);
  });
});

describe('★ the runner picks his pitch', () => {
  it('holds on a late read and goes on an early one, the projected race being equal', () => {
    const s = spec(8, 3);
    expect(cpuWantsSteal(s, { ...FREE, jumpSec: RUN.GO_ON_JUMP_SEC + 0.01 })).toBe(false);
    expect(cpuWantsSteal(s, { ...FREE, jumpSec: RUN.GO_ON_JUMP_SEC })).toBe(true);
    // A caller with no read keeps the old answer.
    expect(cpuWantsSteal(s, FREE)).toBe(true);
  });

  it('★ `jumpSecOf` is the race’s own draw: the same stream gives the same number, and the race ran on it', () => {
    const r = bySpeed(5);
    expect(jumpSecOf(r, makeRng('s'))).toBe(jumpSecOf(r, makeRng('s')));
    const s = spec(5, 9);
    const race = stealRace(s, makeRng('s'));
    expect(throwSecTo(s)! - runnerSecTo(s) - race.marginSec).toBeCloseTo(jumpSecOf(r, makeRng('s')), 9);
  });
});
