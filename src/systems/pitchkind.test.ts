// ---------------------------------------------------------------------------
// Tests for pitch types + strike-zone aiming (main mode). Pure logic only.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { PLATE_ZONE, PITCHES, PITCH_FX, type PitchKind } from '../config';
import {
  availablePitches,
  specialPitches,
  flightProgress,
  isInZone,
  distOffZone,
  edgeFactor,
  resolvePitchLocation,
  chooseCpuPitch,
  ballCurveAt,
  type PitchPlan,
} from './pitchkind';
import { resolveCpuPitchLocated } from './pitch';
import { getCharacter, ROSTER } from '../data/characters';

const seq = (nums: number[]) => {
  let i = 0;
  return () => nums[i++ % nums.length];
};

const planAt = (x: number, y: number, kind: PitchPlan['kind'] = 'fastball'): PitchPlan => ({
  kind,
  target: { x, y },
  actual: { x, y },
  inZone: isInZone({ x, y }),
  travelMs: 500,
});

describe('the strike zone', () => {
  it('classifies in/out and measures distance off the edge', () => {
    expect(isInZone({ x: 0, y: 0 })).toBe(true);
    expect(isInZone({ x: PLATE_ZONE.W / 2, y: 0 })).toBe(true); // on the line
    expect(isInZone({ x: PLATE_ZONE.W / 2 + 1, y: 0 })).toBe(false);
    expect(distOffZone({ x: 0, y: 0 })).toBe(0);
    expect(distOffZone({ x: PLATE_ZONE.W / 2 + 20, y: 0 })).toBe(20);
    expect(edgeFactor({ x: 0, y: 0 })).toBe(0);
    expect(edgeFactor({ x: PLATE_ZONE.W / 2, y: 0 })).toBe(1);
  });
});

describe('resolvePitchLocation', () => {
  it('is deterministic with a seeded rng', () => {
    const a = resolvePitchLocation('curve', { x: 10, y: -20 }, 5, 80, 500, seq([0.3, 0.7]));
    const b = resolvePitchLocation('curve', { x: 10, y: -20 }, 5, 80, 500, seq([0.3, 0.7]));
    expect(a).toEqual(b);
  });

  it('scatter grows with meter error and shrinks with the pitching stat', () => {
    // rng 1.0 pushes the full scatter in +x/+y, so |actual - target| = scatter*sqrt2.
    const missAt = (errorMs: number, stat: number) => {
      const p = resolvePitchLocation('fastball', { x: 0, y: 0 }, stat, errorMs, 500, () => 1);
      return Math.hypot(p.actual.x, p.actual.y);
    };
    expect(missAt(300, 5)).toBeGreaterThan(missAt(0, 5));
    expect(missAt(150, 1)).toBeGreaterThan(missAt(150, 5));
    expect(missAt(150, 5)).toBeCloseTo(missAt(150, 9)); // above 5 doesn't shrink further
  });

  it('a blown meter can turn an aimed strike into a ball', () => {
    const p = resolvePitchLocation(
      'fastball',
      { x: PLATE_ZONE.W / 2 - 6, y: 0 }, // painting the corner
      5,
      400,
      500,
      () => 1
    );
    expect(p.inZone).toBe(false);
  });

  it('travel time comes from the pitch kind', () => {
    const fast = resolvePitchLocation('fastball', { x: 0, y: 0 }, 5, 0, 500, () => 0.5);
    const slow = resolvePitchLocation('changeup', { x: 0, y: 0 }, 5, 0, 500, () => 0.5);
    expect(fast.travelMs).toBeLessThan(500);
    expect(slow.travelMs).toBeGreaterThan(500);
  });
});

describe('availablePitches', () => {
  it('locks the crazy pitch behind juice', () => {
    expect(availablePitches(false)).not.toContain('crazy');
    expect(availablePitches(true)).toContain('crazy');
  });

  it('the CPU base rotation is frozen at the classic four (goldlog rng contract)', () => {
    // chooseCpuPitch samples this list with rng — its LENGTH is part of the
    // seeded-rng fingerprint. New specials belong in specialPitches.
    expect(availablePitches(false)).toEqual(['fastball', 'changeup', 'curve', 'screwball']);
  });

  it('the juice specials never leak into the base rotation', () => {
    expect(specialPitches()).toEqual(['crazy', 'fireball', 'freezeball']);
    for (const sp of specialPitches()) {
      expect(availablePitches(false)).not.toContain(sp);
    }
  });
});

describe('PITCHES definitions', () => {
  it('every kind has a positive speed and a labeled card', () => {
    for (const def of Object.values(PITCHES)) {
      expect(def.speedMult).toBeGreaterThan(0);
      expect(def.label.length).toBeGreaterThan(2);
    }
  });
});

describe('flightProgress (the freezeball time-remap)', () => {
  const kinds = Object.keys(PITCHES) as PitchKind[];

  it('is the identity for every kind except freezeball', () => {
    for (const kind of kinds.filter((k) => k !== 'freezeball')) {
      for (let t = 0; t <= 1.0001; t += 0.05) {
        expect(flightProgress(kind, t)).toBe(t);
      }
    }
  });

  it('hits both endpoints exactly (arrival IS travelMs)', () => {
    expect(flightProgress('freezeball', 0)).toBe(0);
    expect(flightProgress('freezeball', 1)).toBeCloseTo(1, 10);
  });

  it('is monotone non-decreasing and flat exactly inside the hold window', () => {
    const { HOLD_START, HOLD_END } = PITCH_FX.FREEZE;
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const u = flightProgress('freezeball', t);
      expect(u).toBeGreaterThanOrEqual(prev);
      prev = u;
    }
    const frozenAt = flightProgress('freezeball', HOLD_START);
    expect(flightProgress('freezeball', (HOLD_START + HOLD_END) / 2)).toBe(frozenAt);
    expect(flightProgress('freezeball', HOLD_END + 0.01)).toBeGreaterThan(frozenAt);
  });
});

describe('chooseCpuPitch', () => {
  it('wastes pitches off the zone when ahead 0-2', () => {
    // rng: kind pick, corner signs x/y, waste roll (< .55 → waste), y variant,
    // cpu errorMs, then 2 scatter rolls (0.5 → no drift).
    const p = chooseCpuPitch(9, { balls: 0, strikes: 2 }, 950, seq([0.1, 0.9, 0.9, 0.3, 0.3, 0.1, 0.5, 0.5]));
    expect(Math.abs(p.target.x)).toBeGreaterThan(PLATE_ZONE.W / 2);
    expect(isInZone(p.target)).toBe(false);
  });

  it('grooves one down the middle at 3 balls', () => {
    const p = chooseCpuPitch(9, { balls: 3, strikes: 0 }, 950, seq([0.1, 0.9, 0.9, 0.9, 0.1, 0.5, 0.5]));
    expect(Math.abs(p.target.x)).toBeLessThan(PLATE_ZONE.W / 4);
    expect(Math.abs(p.target.y)).toBeLessThan(PLATE_ZONE.H / 4);
  });

  it('good pitchers hit the zone far more often than wild ones', () => {
    const rateFor = (stat: number) => {
      const rng = seq([0.37, 0.71, 0.13, 0.89, 0.53, 0.29, 0.97, 0.61, 0.07, 0.43]);
      let strikes = 0;
      for (let i = 0; i < 300; i++) {
        if (chooseCpuPitch(stat, { balls: 1, strikes: 1 }, 950, rng).inZone) strikes++;
      }
      return strikes / 300;
    };
    expect(rateFor(9)).toBeGreaterThan(rateFor(1));
    expect(rateFor(9)).toBeGreaterThan(0.5); // aces mostly throw strikes
  });
});

describe('resolveCpuPitchLocated', () => {
  const batter = ROSTER.map((c) => c.id).map(getCharacter)[0];

  it('a pitch far off the zone is taken for a ball', () => {
    const plan = planAt(PLATE_ZONE.W / 2 + 60, 0);
    const r = resolveCpuPitchLocated(plan, 'good', batter, () => 0.9);
    expect(r.isBall).toBe(true);
    expect(r.cpuSwings).toBe(false);
  });

  it('deceptive pitches just off the edge get chased sometimes', () => {
    const plan = planAt(PLATE_ZONE.W / 2 + 8, 0, 'changeup');
    // First rng below the chase threshold → chase; swing is weak or miss.
    const r = resolveCpuPitchLocated(plan, 'good', batter, seq([0.05, 0.4]));
    expect(r.isBall).toBe(true);
    expect(r.cpuSwings).toBe(true);
    expect(['weak', 'miss']).toContain(r.cpuBand);
  });

  it('a perfect meter drags an in-zone swing down a band', () => {
    // rng: swing roll .9 (perfect), edge roll, deception roll — no extra downgrades.
    const relaxed = resolveCpuPitchLocated(planAt(0, 0), 'weak', batter, seq([0.9, 0.99, 0.99]));
    const sharp = resolveCpuPitchLocated(planAt(0, 0), 'perfect', batter, seq([0.9, 0.99, 0.99]));
    expect(relaxed.cpuBand).toBe('perfect');
    expect(sharp.cpuBand).toBe('good');
  });

  it('painting the corner drags the swing down too', () => {
    const corner = planAt(PLATE_ZONE.W / 2 - 2, PLATE_ZONE.H / 2 - 2);
    // edge roll 0.2 < edgeFactor*0.4 → downgrade fires at the corner, not center.
    const center = resolveCpuPitchLocated(planAt(0, 0), 'weak', batter, seq([0.9, 0.2, 0.99]));
    const painted = resolveCpuPitchLocated(corner, 'weak', batter, seq([0.9, 0.2, 0.99]));
    expect(center.cpuBand).toBe('perfect');
    expect(painted.cpuBand).toBe('good');
  });
});

describe('ballCurveAt', () => {
  it('starts and ends on the straight line (leaves the hand, arrives at actual)', () => {
    for (const kind of ['fastball', 'curve', 'screwball', 'crazy'] as const) {
      const plan = planAt(0, 0, kind);
      const a = ballCurveAt(plan, 0);
      const b = ballCurveAt(plan, 1);
      expect(Math.hypot(a.x, a.y)).toBeLessThan(0.001);
      expect(Math.hypot(b.x, b.y)).toBeLessThan(0.001);
    }
  });

  it('bends in the pitch definition direction mid-flight', () => {
    const curve = ballCurveAt(planAt(0, 0, 'curve'), 0.6);
    const screw = ballCurveAt(planAt(0, 0, 'screwball'), 0.6);
    expect(curve.x).toBeLessThan(0); // curve breaks glove-side
    expect(screw.x).toBeGreaterThan(0);
    expect(PITCHES.fastball.breakX).toBe(0);
    const fast = ballCurveAt(planAt(0, 0, 'fastball'), 0.6);
    expect(fast.x).toBe(0);
  });
});
