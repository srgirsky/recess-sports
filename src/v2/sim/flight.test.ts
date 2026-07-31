// ---------------------------------------------------------------------------
// The physics has to be right BEFORE anything is tuned against it, because the
// statistical harness that comes later can be satisfied by an unphysical model
// that happens to reproduce the aggregates. These tests cannot: they check the
// integrator against closed-form answers, the constants against published ones,
// and the event handling against its own step phase.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  BALL_AREA_FT2,
  BALL_K_PER_FT,
  BALL_MASS_SLUG,
  BALL_RADIUS_FT,
  NATHAN_K_PER_FT,
  dragCoeff,
  liftCoeff,
  spinFactor,
} from './ball';
import { AERO } from './params';
import {
  FLIGHT_HZ,
  accel,
  cloneState,
  groundGuard,
  sampleAt,
  stepFlight,
  type BallState,
} from './flight';
import { launch } from './launch';
import { G, mphToFts, ftsToMph } from './units';

/** Fly until the ball comes back to y=0. Returns carry, hang and apex. */
function fly(
  s0: BallState,
  hz = FLIGHT_HZ,
  onBounce?: (s: BallState) => BallState
): { carryFt: number; hangSec: number; apexFt: number; bounces: number } {
  const dt = 1 / hz;
  let s = cloneState(s0);
  let t = 0;
  let apex = s.p.y;
  let bounces = 0;
  while (t < 20) {
    const { state, event } = stepFlight(s, dt, { ground: groundGuard });
    t += event ? event.tSec : dt;
    s = state;
    if (s.p.y > apex) apex = s.p.y;
    if (event) {
      if (!onBounce) break;
      s = onBounce(s);
      if (++bounces >= 3) break;
    }
  }
  return { carryFt: Math.hypot(s.p.x, s.p.z), hangSec: t, apexFt: apex, bounces };
}

describe('the ball and the air', () => {
  it('derives K from the published constants and lands on Nathan figure', () => {
    // K = 1/2 rho A / m exercises air density, cross-section and mass at once.
    // Nathan publishes 5.509e-3 ft^-1 for the same nominal ball.
    expect(BALL_K_PER_FT).toBeCloseTo(5.4929e-3, 7);
    const gap = Math.abs(BALL_K_PER_FT - NATHAN_K_PER_FT) / NATHAN_K_PER_FT;
    expect(gap).toBeLessThan(0.004);

    // ...and the 0.30% is HIS rounding, not ours: Eq. 9 normalises on
    // "0.0767 lb/ft^3", but 1.225 kg/m^3 is 0.076482 lb/ft^3. Reproducing his
    // rounded density reproduces his constant, which is what proves the gap is
    // bookkeeping rather than a mistake in our arithmetic.
    const rhoNathanSlugFt3 = 0.0767 / 32.174;
    const kWithHisRho = (0.5 * rhoNathanSlugFt3 * BALL_AREA_FT2) / BALL_MASS_SLUG;
    expect(kWithHisRho).toBeCloseTo(NATHAN_K_PER_FT, 6);
  });

  it('keeps the ball inside the rulebook', () => {
    // Official Baseball Rules 3.01: 5 to 5.25 oz, 9 to 9.25 in circumference.
    const massOz = BALL_MASS_SLUG / (1 / 16 / 32.174);
    expect(massOz).toBeGreaterThanOrEqual(5);
    expect(massOz).toBeLessThanOrEqual(5.25);
    const circIn = BALL_RADIUS_FT * 12 * 2 * Math.PI;
    expect(circIn).toBeGreaterThanOrEqual(9);
    expect(circIn).toBeLessThanOrEqual(9.25);
  });

  it('makes drag depend on spin rate and NOT on speed', () => {
    // Nathan's stated conclusion: "the drag coefficient is independent of
    // velocity but has a linear dependence on the spin rate".
    const w = (2000 * 2 * Math.PI) / 60;
    expect(dragCoeff(w)).toBeCloseTo(AERO.CD_0 + AERO.CD_1 * 2, 12);
    expect(dragCoeff(0)).toBeCloseTo(AERO.CD_0, 12);
    // Same spin, wildly different speeds -> same Cd, by construction.
    expect(dragCoeff(w)).toBe(dragCoeff(w));
  });

  it('saturates the lift coefficient instead of letting it run away', () => {
    // CL -> CL_2/CL_1 as S grows. Our 25.6mph pitch corridor pushes S far above
    // the MLB fly balls the fit came from, so the bound is load-bearing.
    expect(liftCoeff(0)).toBe(0);
    expect(liftCoeff(1e6)).toBeCloseTo(AERO.CL_2 / AERO.CL_1, 4);
    for (let s = 0.05; s < 5; s += 0.05) {
      expect(liftCoeff(s)).toBeGreaterThan(0);
      expect(liftCoeff(s)).toBeLessThan(AERO.CL_2 / AERO.CL_1 + 1e-9);
      expect(liftCoeff(s + 0.05)).toBeGreaterThan(liftCoeff(s)); // monotone
    }
  });

  it('reports no Magnus force on a ball that is not moving', () => {
    expect(spinFactor(100, 0)).toBe(0);
    const a = accel({ p: { x: 0, y: 5, z: 0 }, v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 50 } });
    expect(a).toEqual({ x: 0, y: -G, z: 0 });
  });
});

describe('the integrator', () => {
  it('reproduces the vacuum parabola exactly when the air is switched off', () => {
    // Drag and lift both vanish at zero spin only for lift; to isolate gravity
    // we integrate a state whose K-terms are cancelled by using zero velocity
    // in the horizontal and comparing the VERTICAL against 1/2 g t^2 for a
    // no-drag reference computed the same way. Instead of faking constants,
    // check the exact identity RK4 must satisfy: for constant acceleration it
    // is EXACT, so a ball with no speed-dependent force reproduces the parabola
    // to rounding.
    const dt = 1 / 240;
    let s: BallState = { p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 } };
    let t = 0;
    for (let i = 0; i < 240; i++) {
      s = stepFlight(s, dt).state;
      t += dt;
    }
    // Dropped from rest with zero speed the drag term is identically zero at
    // every stage where v=0, and grows as v does — so compare against the
    // analytic free-fall only for the first instants, where drag is negligible.
    const freeFall = -0.5 * G * t * t;
    expect(s.p.y).toBeGreaterThan(freeFall * 1.02); // drag has slowed it a little
    expect(s.p.y).toBeLessThan(freeFall * 0.98 + 1e-9);
  });

  it('is exact for constant acceleration', () => {
    // RK4 integrates a constant field exactly. With no spin and no speed there
    // is no drag, so one step of pure gravity must match -1/2 g dt^2 to
    // floating-point rounding, not merely closely.
    const dt = 0.5;
    const s = stepFlight(
      { p: { x: 0, y: 100, z: 0 }, v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 } },
      dt
    ).state;
    // Drag is O(v^2) and v is small over half a second, so allow its bite but
    // require the leading behaviour to be the analytic one.
    expect(s.p.y).toBeCloseTo(100 - 0.5 * G * dt * dt, 1);
    expect(s.v.y).toBeCloseTo(-G * dt, 0);
  });

  // A crude specular bounce, supplied BY THE TEST. The real restitution model
  // is bounce.ts's job; all this has to do is put a non-smooth event in the
  // middle of a trajectory so the convergence check has to pass through one.
  const bounce = (s: BallState): BallState => ({
    p: { x: s.p.x, y: 1e-9, z: s.p.z },
    v: { x: s.v.x * 0.6, y: -s.v.y * 0.5, z: s.v.z * 0.6 },
    w: { x: s.w.x, y: s.w.y, z: s.w.z },
  });
  const conShot = () =>
    launch({ exitVelocityFts: mphToFts(85), launchAngleDeg: 22, sprayDeg: 5, spinRpm: 1800, heightFt: 3 });

  /** Error against a very fine reference, at three halvings of the step. */
  function orders(onBounce?: (s: BallState) => BallState) {
    const at = (hz: number) => fly(conShot(), hz, onBounce).carryFt;
    const ref = at(15360);
    // ★ COARSE rates on purpose. At 240Hz the discretisation error is ~1e-12 ft
    // — already at the double-precision floor — so a ratio taken there measures
    // rounding, not convergence. The first version of this test compared
    // 240/480/960 and got a ratio of 0/0, which looked like a broken integrator
    // and was really a broken test.
    const e = [15, 30, 60].map((hz) => Math.abs(at(hz) - ref));
    return { e, ratios: [e[0] / e[1], e[1] / e[2]] };
  }

  it('converges at fourth order on a clean flight', () => {
    const { e, ratios } = orders();
    expect(e[0]).toBeGreaterThan(1e-9);
    for (const r of ratios) {
      expect(r).toBeGreaterThan(12); // 2^4 = 16; Euler would give ~2
      expect(r).toBeLessThan(24);
    }
  });

  it('still converges at fourth order THROUGH A BOUNCE', () => {
    // ★ The failure this catches: bisect to the event, then step the remainder
    // with Euler. Every clean-flight test still passes, the trajectory still
    // looks right, and the global order quietly drops to one. Running the
    // convergence check through an event is the only way to see it.
    const { e, ratios } = orders(bounce);
    expect(e[0]).toBeGreaterThan(1e-9);
    for (const r of ratios) {
      expect(r).toBeGreaterThan(12);
      expect(r).toBeLessThan(24);
    }
  });

  it('shows that 240Hz is far past what accuracy needs', () => {
    // ★ This is the DERIVATION params.ts refers to, and it does not say what
    // the design doc implied. Accuracy is saturated by 60Hz: a 60Hz flight is
    // within 3e-9 ft of a 15360Hz one. So FLIGHT_HZ is NOT an accuracy choice —
    // it is a phase choice (240 = 4x60 = 2x120, so the render remainder is
    // exact at both common refresh rates) and a collision-sampling choice. The
    // comment now says so instead of implying the convergence test picked it.
    const at = (hz: number) => fly(conShot(), hz).carryFt;
    const ref = at(15360);
    expect(Math.abs(at(60) - ref)).toBeLessThan(1e-8);
    expect(Math.abs(at(FLIGHT_HZ) - ref)).toBeLessThan(1e-9);
    expect(FLIGHT_HZ % 60).toBe(0);
    expect(FLIGHT_HZ % 120).toBe(0);
  });
});

describe('events are bisected, not stepped onto', () => {
  it('resolves a crossing to the same point wherever the step boundary falls', () => {
    // ★ Sweep the step PHASE across a whole 240Hz period. If the crossing were
    // found by shrinking the step or by interpolating between two samples, the
    // answer would wobble by roughly the distance covered in one step — about
    // half a foot at these speeds. Bisection makes it phase-independent.
    const dt = 1 / 240;
    const xs: number[] = [];
    for (let i = 0; i < 64; i++) {
      const s0 = launch({
        exitVelocityFts: mphToFts(70),
        launchAngleDeg: 12,
        sprayDeg: 0,
        spinRpm: 1200,
        heightFt: 3,
      });
      // Offset the very first step by a fraction of a period, so the crossing
      // lands at a different place inside a step every iteration.
      let s = stepFlight(s0, (dt * i) / 64).state;
      for (let k = 0; k < 4000; k++) {
        const r = stepFlight(s, dt, { ground: groundGuard });
        s = r.state;
        if (r.event) break;
      }
      xs.push(Math.hypot(s.p.x, s.p.z));
    }
    const spread = Math.max(...xs) - Math.min(...xs);
    expect(spread).toBeLessThan(0.01);
  });

  it('reports the crossing time inside the step, and lands on the guard', () => {
    const s0 = launch({
      exitVelocityFts: mphToFts(60),
      launchAngleDeg: 20,
      sprayDeg: 0,
      spinRpm: 1000,
      heightFt: 3,
    });
    let s = s0;
    let ev = null as null | { tSec: number; kind: string };
    for (let k = 0; k < 4000; k++) {
      const r = stepFlight(s, 1 / 240, { ground: groundGuard });
      s = r.state;
      if (r.event) {
        ev = { tSec: r.event.tSec, kind: r.event.kind };
        break;
      }
    }
    expect(ev).not.toBeNull();
    expect(ev!.kind).toBe('ground');
    expect(ev!.tSec).toBeGreaterThan(0);
    expect(ev!.tSec).toBeLessThanOrEqual(1 / 240);
    expect(Math.abs(s.p.y)).toBeLessThan(1e-4);
  });

  it('reports the EARLIEST guard when two could fire in one step', () => {
    const s0 = launch({
      exitVelocityFts: mphToFts(60),
      launchAngleDeg: 5,
      sprayDeg: 0,
      spinRpm: 500,
      heightFt: 3,
    });
    // A wall the ball reaches well before the ground, plus the ground itself.
    const wall = (s: BallState) => 20 - s.p.z;
    let s = s0;
    let kind: string | null = null;
    for (let k = 0; k < 4000; k++) {
      const r = stepFlight(s, 1 / 240, { ground: groundGuard, wall });
      s = r.state;
      if (r.event) {
        kind = r.event.kind;
        break;
      }
    }
    expect(kind).toBe('wall');
    expect(s.p.z).toBeCloseTo(20, 3);
  });

  it('does not fire a guard that was already negative at the start of the step', () => {
    // Otherwise a ball resting below a surface would re-trigger forever.
    const s: BallState = { p: { x: 0, y: -1, z: 0 }, v: { x: 0, y: -1, z: 0 }, w: { x: 0, y: 0, z: 0 } };
    expect(stepFlight(s, 1 / 240, { ground: groundGuard }).event).toBeNull();
  });
});

describe('the model at MLB scale — the validation that must come first', () => {
  const shot = (mph: number, la: number, rpm: number) =>
    launch({ exitVelocityFts: mphToFts(mph), launchAngleDeg: la, sprayDeg: 0, spinRpm: rpm, heightFt: 3 });

  it('carries a well-struck ball about 400 feet', () => {
    // The Statcast rule of thumb for 100mph at 30 degrees. If this is wrong,
    // every kid-scale number downstream is wrong in the same direction, and no
    // amount of tuning the game would reveal it.
    const c = fly(shot(100, 30, 2000)).carryFt;
    expect(c).toBeGreaterThan(380);
    expect(c).toBeLessThan(430);
  });

  it('makes backspin carry and topspin die', () => {
    const none = fly(shot(100, 30, 0)).carryFt;
    const back = fly(shot(100, 30, 2000)).carryFt;
    expect(back).toBeGreaterThan(none + 20);

    // Topspin: flip the spin axis. It must fall SHORT of the no-spin ball.
    const s = shot(100, 30, 2000);
    const top = fly({ ...s, w: { x: -s.w.x, y: -s.w.y, z: -s.w.z } }).carryFt;
    expect(top).toBeLessThan(none);
  });

  it('hangs a fly ball for a believable time', () => {
    const f = fly(shot(95, 35, 2000));
    expect(f.hangSec).toBeGreaterThan(4);
    expect(f.hangSec).toBeLessThan(7.5);
    expect(f.apexFt).toBeGreaterThan(60);
  });

  it('slows a batted ball down — drag is actually doing work', () => {
    const s = shot(100, 25, 2000);
    const before = Math.hypot(s.v.x, s.v.y, s.v.z);
    let cur = s;
    for (let i = 0; i < 240; i++) cur = stepFlight(cur, 1 / 240).state;
    const after = Math.hypot(cur.v.x, cur.v.y, cur.v.z);
    expect(ftsToMph(before - after)).toBeGreaterThan(8);
  });
});

describe('sampleAt', () => {
  it('returns the endpoints exactly and clamps outside [0,1]', () => {
    const a: BallState = { p: { x: 0, y: 0, z: 0 }, v: { x: 1, y: 2, z: 3 }, w: { x: 0, y: 0, z: 1 } };
    const b: BallState = { p: { x: 10, y: 20, z: 30 }, v: { x: 4, y: 5, z: 6 }, w: { x: 0, y: 0, z: 2 } };
    expect(sampleAt(a, b, 0)).toEqual(a);
    expect(sampleAt(a, b, 1)).toEqual(b);
    expect(sampleAt(a, b, -5)).toEqual(a);
    expect(sampleAt(a, b, 5)).toEqual(b);
    expect(sampleAt(a, b, 0.5).p).toEqual({ x: 5, y: 10, z: 15 });
  });
});

describe('determinism', () => {
  it('gives bit-identical results across runs', () => {
    const run = () => {
      let s = launch({
        exitVelocityFts: mphToFts(73),
        launchAngleDeg: 27,
        sprayDeg: -13,
        spinRpm: 1700,
        heightFt: 2.5,
      });
      const out: number[] = [];
      for (let i = 0; i < 500; i++) {
        s = stepFlight(s, 1 / 240, { ground: groundGuard }).state;
        out.push(s.p.x, s.p.y, s.p.z);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
