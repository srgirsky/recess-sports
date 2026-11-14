// ---------------------------------------------------------------------------
// A person on the mound, and a person sending runners.
//
// The two remaining verbs, checked the way `swing.test.ts` checks the first:
// a human supplies the model's own INPUTS and never its outcomes, so every
// assertion here is about a mechanism reaching a decision rather than about a
// rate. `sim.humanPitch` records what was measured.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { throwPitch, isStrike, type PitchPlan } from './atbat';
import { makeRng } from './rng';
import { zoneBandFt, zoneHalfWidthFt } from './athletes';
import { ROSTER } from '../../data/characters';
import { PITCH } from './params';
import {
  PITCHES,
  PITCH_SPOTS,
  SPECIAL_PITCH_KINDS,
  armMult,
  flyToPlate,
  releaseAtSpot,
  releaseFrom,
  type PitchKind,
} from './pitch';

const byArm = (v: number) =>
  ROSTER.reduce((b, c) =>
    Math.abs(c.stats.pitching - v) < Math.abs(b.stats.pitching - v) ? c : b
  );

const spec = (pitcher = byArm(5)) => ({
  pitcher,
  batter: ROSTER[0],
  count: { balls: 0, strikes: 0 },
});

const [ZLO, ZHI] = zoneBandFt();
const MID = (ZLO + ZHI) / 2;
const plan = (over: Partial<PitchPlan> = {}): PitchPlan => ({
  kind: 'fastball',
  aimLateralFt: 0,
  aimHeightFt: MID,
  ...over,
});

/** Mean distance from the spot the pitcher aimed at, ft. */
function missFt(pitcher: (typeof ROSTER)[number], p: PitchPlan, n = 120): number {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const inF = throwPitch(spec(pitcher), makeRng(`m${i}`), p);
    const dx = inF.crossing.x - p.aimLateralFt;
    const dy = inF.crossing.y - p.aimHeightFt;
    sum += Math.sqrt(dx * dx + dy * dy);
  }
  return sum / n;
}

describe('★ a person picks the pitch, and still misses by his own arm', () => {
  it('★ throws where he aimed, within the arm that threw it', () => {
    // The plan is honoured — the crossing tracks the spot rather than ignoring
    // it. Asserted as a CORRELATION over the zone, not as a single pitch.
    for (const height of [ZLO + 0.1, MID, ZHI - 0.1]) {
      let sum = 0;
      for (let i = 0; i < 60; i++) {
        sum += throwPitch(spec(), makeRng(`h${i}`), plan({ aimHeightFt: height })).crossing.y;
      }
      expect(sum / 60, `aimed at ${height}`).toBeCloseTo(height, 0);
    }
    for (const lateral of [-0.5, 0, 0.5]) {
      let sum = 0;
      for (let i = 0; i < 60; i++) {
        sum += throwPitch(spec(), makeRng(`l${i}`), plan({ aimLateralFt: lateral })).crossing.x;
      }
      expect(sum / 60, `aimed at ${lateral}`).toBeCloseTo(lateral, 0);
    }
  });

  it('★ a weak arm scatters more than a strong one, with the SAME plan', () => {
    // ★ THE ONE VARIABLE IS THE ARM. Same spot, same seeds, same kind — so this
    // cannot be satisfied by the plan being ignored, which is the failure mode
    // "wired but inert" would produce (every arm would miss identically).
    const p = plan();
    let prev = Infinity;
    for (const arm of [2, 5, 8, 10]) {
      const miss = missFt(byArm(arm), p);
      expect(miss, `arm ${arm}`).toBeLessThan(prev);
      prev = miss;
    }
  });

  it('★ the kind is honoured, and different kinds break differently', () => {
    const seen = new Map<string, number>();
    for (const kind of ['fastball', 'changeup', 'curve', 'screwball'] as const) {
      let sum = 0;
      for (let i = 0; i < 40; i++) {
        const inF = throwPitch(spec(), makeRng(`k${i}`), plan({ kind }));
        expect(inF.kind, 'the kind a person chose must be the kind thrown').toBe(kind);
        sum += inF.travelSec;
      }
      seen.set(kind, sum / 40);
    }
    // A changeup must actually be slower than a fastball — otherwise choosing is
    // cosmetic. `sim.pitchCorridorV2`: the break is emergent Magnus, not a bow.
    expect(seen.get('changeup')).toBeGreaterThan(seen.get('fastball')!);
  });

  it('★ aiming at the zone gets strikes and aiming off it does not', () => {
    // What makes the spot a DECISION rather than a readout.
    const inZone = (p: PitchPlan) => {
      let n = 0;
      for (let i = 0; i < 120; i++) {
        if (isStrike(throwPitch(spec(byArm(9)), makeRng(`z${i}`), p).crossing)) n++;
      }
      return n;
    };
    expect(inZone(plan())).toBeGreaterThan(inZone(plan({ aimHeightFt: ZHI + 1.2 })));
    expect(inZone(plan())).toBeGreaterThan(
      inZone(plan({ aimLateralFt: zoneHalfWidthFt() + 1.2 }))
    );
  });

  it('★ has no accuracy constant of its own — the arm is the only term', () => {
    // The `sim.plateDiscipline` check pointed at the mound: a human accuracy
    // knob would be a second, independent answer to a question `pitching`
    // already answers, and it would let a player out-throw his own kid.
    const p = plan();
    const same = throwPitch(spec(byArm(5)), makeRng('same'), p);
    const again = throwPitch(spec(byArm(5)), makeRng('same'), p);
    expect(same.crossing).toEqual(again.crossing);
    // And a different arm, same seed and same plan, must land elsewhere.
    const other = throwPitch(spec(byArm(10)), makeRng('same'), p);
    expect(other.crossing).not.toEqual(same.crossing);
  });
});

describe('★ a better arm never throws the slower pitch', () => {
  // The property the release solve exists to deliver, and for four months did
  // not: its outer solve was a secant that extrapolated through the speed at
  // which a release stops reaching the plate, so a pitching-5 fastball
  // crossed in 1.01 s and a pitching-7 one in 1.19 s. Every total stayed
  // plausible. Only an ORDER can see it (`sim.pitch-corridor`
  // theSolveIsABisection), so that is what is asserted — never a flight time.
  const KINDS = [...(Object.keys(PITCHES) as PitchKind[]), ...SPECIAL_PITCH_KINDS];
  const halfH = (ZHI - ZLO) / 2;
  const flight = (kind: PitchKind, stat: number, spot: { lateral: number; height: number }) =>
    flyToPlate(
      releaseFrom(
        releaseAtSpot({
          kind,
          pitchingStat: stat,
          aimLateralFt: spot.lateral * zoneHalfWidthFt(),
          aimHeightFt: MID + spot.height * halfH,
        })
      )
    ).travelSec;

  it.each(KINDS)('%s: flight time never rises with the pitching stat, at any spot', (kind) => {
    for (const spot of PITCH_SPOTS) {
      let prev = Infinity;
      for (let stat = 1; stat <= 10; stat++) {
        const t = flight(kind, stat, spot);
        // Two solves for one target agree to the solve's own tolerance.
        expect(t, `${kind} stat ${stat} at ${spot.lateral},${spot.height}`).toBeLessThanOrEqual(prev + 2 * PITCH.AIM_TOL_SEC);
        prev = Math.min(prev, t);
      }
    }
  }, 120_000);

  it('the best arm is properly quicker than the worst, for every kind', () => {
    for (const kind of KINDS) {
      expect(flight(kind, 10, PITCH_SPOTS[4]), kind).toBeLessThan(flight(kind, 1, PITCH_SPOTS[4]) - 0.05);
    }
  }, 120_000);

  it('a reachable target is hit: the fastball takes what its arm was asked for', () => {
    for (let stat = 1; stat <= 10; stat++) {
      const want = PITCH.FLIGHT_TIME_SEC * armMult(stat);
      expect(Math.abs(flight('fastball', stat, PITCH_SPOTS[4]) - want), `stat ${stat}`).toBeLessThan(2 * PITCH.AIM_TOL_SEC);
    }
  }, 120_000);
});
