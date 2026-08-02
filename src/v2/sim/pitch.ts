// ---------------------------------------------------------------------------
// The pitch, as a real trajectory. PURE.
//
// ★ WHAT THIS REPLACES. v1's `pitchkind.ts` does not fly a ball: it lerps along
// a straight mound-to-plate line and adds a decorative bow (`ballCurveAt`) that
// is forced to zero at BOTH ends, so the ball "leaves the hand and arrives at
// `actual` exactly". The crossing point is a rolled endpoint, not a consequence
// of the release. There is no velocity, no gravity and no Magnus — the flight
// and the timing are two unrelated systems glued together at `travelMs`.
//
// Here a pitch is released with a velocity and a spin, and where it crosses is
// wherever the integrator puts it. A curveball breaks because of the Magnus
// force `flight.ts` already applies, not because a bow was drawn on it.
//
// ★ THE CORRIDOR IS INHERITED, NOT RE-CLAIMED. `pace.pitchCorridor` is
// `awaiting-measurement` at n=1: one HEAT pitch bracketed against a millisecond
// stopwatch captured in the same frame, 1230ms over 46ft. Its own note says
// "the repo convention is n<3 stays a partialReading, and the entire point of
// this record is that overclaiming is how the 270ms happened. Do not promote to
// conformed without n>=3 per kind." Consuming a number does not measure it, so
// `sim.pitchCorridor` inherits that status verbatim.
//
// 46ft in 1230ms is 37.4 ft/s — 25.5 mph, a real seven-year-old's fastball.
//
// ★ ON TRIG: once per pitch, to turn an aim point into a release direction.
// Same boundary as `launch.ts` and `contact.ts`; the per-step path stays clean.
// ---------------------------------------------------------------------------

import { MOUND_DIST, type Vec3 } from './field';
import { PITCH } from './params';
import { clamp } from './units';
import { FLIGHT_HZ, cloneState, stepFlight, type BallState, type Guard } from './flight';

export type PitchKind = 'fastball' | 'changeup' | 'curve' | 'screwball';

export interface PitchDef {
  /** Multiplier on the base release speed. */
  speedMult: number;
  /**
   * Spin axis and rate. The BREAK IS EMERGENT: `flight.ts` applies
   * `K*Cl*|v|*(w_hat x v)`, so the axis decides which way the ball moves and
   * the rate decides how much. Nothing here draws a curve.
   */
  spinRpm: number;
  /** Spin axis, unit-ish, in the pitcher's frame. +y is up, +x toward 1B. */
  axis: Vec3;
}

/**
 * The four base pitches. v1 has seven, but three of them (crazy, fireball,
 * freezeball) are juice-meter specials that "never appear in the CPU's base
 * rotation" — they are a presentation feature, and they belong with the game
 * layer rather than the physics.
 */
/**
 * ★ THE AXIS SIGNS ARE EASY TO GET BACKWARDS AND THE SOLVE HIDES IT.
 *
 * The Magnus force is `w_hat x v`, and a pitch travels toward the plate with
 * `v` along -z, so the force reduces to `(-w_y, w_x, 0)`:
 *
 *     w_x > 0  ->  force UP     (backspin, a "rising" fastball)
 *     w_y > 0  ->  force toward THIRD base
 *
 * Every axis here was inverted in the first draft: the fastball's "backspin"
 * produced sink, and the curve rose while breaking toward FIRST. Nothing caught
 * it, because `releasePitch` solves the release to hit the aim point and simply
 * compensated — the pitch still crossed the plate exactly where it was aimed,
 * with the break pointing the wrong way. Found by printing the break, which is
 * why the demo prints it.
 */
export const PITCHES: Record<PitchKind, PitchDef> = {
  /** Backspin: falls less than gravity alone, which is why it reads as flat. */
  fastball: { speedMult: 1.0, spinRpm: 1400, axis: { x: 1, y: 0, z: 0 } },
  /** Slower and spun less, so it drops away. */
  changeup: { speedMult: 0.78, spinRpm: 700, axis: { x: 1, y: 0, z: 0 } },
  /** Topspin tilted: drops hard and breaks toward third. */
  curve: { speedMult: 0.88, spinRpm: 1500, axis: { x: -0.8, y: 0.6, z: 0 } },
  /** The mirror image — drops and runs toward first. */
  screwball: { speedMult: 0.9, spinRpm: 1300, axis: { x: -0.8, y: -0.6, z: 0 } },
};

/**
 * Release a pitch toward a point at the plate.
 *
 * `aimHeightFt` is where the pitcher is trying to make it cross; the ball is
 * launched on the straight line to that point and then GRAVITY AND MAGNUS TAKE
 * IT SOMEWHERE ELSE. That gap is the pitch's break, and it is the whole reason
 * this is a trajectory rather than a lerp.
 */
export function releasePitch(opts: {
  kind: PitchKind;
  pitchingStat: number;
  aimHeightFt: number;
  aimLateralFt: number;
}): BallState {
  const def = PITCHES[opts.kind];
  const from: Vec3 = { x: 0, y: PITCH.RELEASE_HEIGHT_FT, z: MOUND_DIST };

  const w = (def.spinRpm * 2 * Math.PI) / 60;
  const an = Math.sqrt(def.axis.x * def.axis.x + def.axis.y * def.axis.y + def.axis.z * def.axis.z) || 1;
  const spin: Vec3 = {
    x: (def.axis.x / an) * w,
    y: (def.axis.y / an) * w,
    z: (def.axis.z / an) * w,
  };

  // The flight time this pitch is trying to achieve. A faster arm and a faster
  // pitch KIND both shorten it; the measured 1230ms is the average arm's
  // fastball.
  const wantSec = (PITCH.FLIGHT_TIME_SEC / def.speedMult) * armMult(opts.pitchingStat);

  // ★ SOLVE, DO NOT ASSUME. Two constraints — cross the plate at the aim
  // height, and take `wantSec` doing it — determine two unknowns, the release
  // speed and its elevation. Neither can be picked independently: raising the
  // elevation to stop the ball landing short also lengthens the flight, and
  // raising the speed to shorten the flight also flattens the arc.
  //
  // The inner solve finds the elevation that hits the aim height at a given
  // speed; the outer one adjusts the speed until the flight lasts as long as it
  // should. Both are secant iterations — there is no closed form once drag and
  // Magnus are in.
  const azRad = Math.atan2(opts.aimLateralFt - from.x, 0 - from.z);

  const timeAt = (speed: number) => {
    const elev = solveElevation(from, speed, azRad, spin, opts.aimHeightFt);
    // Unreachable: report a flight LONGER than any target, so the secant reads
    // it as "too slow" and pushes the speed up rather than stalling.
    if (elev === null) return { elev: 0.6, sec: PITCH.MAX_FLIGHT_SEC };
    const flown = flyToPlate({ p: { ...from }, v: velocityAt(elev, azRad, speed), w: { ...spin } });
    return { elev, sec: flown.travelSec };
  };

  let s0 = 30;
  let s1 = 55;
  let f0 = timeAt(s0).sec - wantSec;
  let f1 = timeAt(s1).sec - wantSec;
  for (let i = 0; i < PITCH.AIM_ITERATIONS; i++) {
    const d = f1 - f0;
    if (d === 0) break;
    const next = clamp(s1 - f1 * ((s1 - s0) / d), 15, 200);
    s0 = s1;
    f0 = f1;
    s1 = next;
    f1 = timeAt(s1).sec - wantSec;
    if (Math.abs(f1) < PITCH.AIM_TOL_SEC) break;
  }

  const final = timeAt(s1);
  return { p: { ...from }, v: velocityAt(final.elev, azRad, s1), w: spin };
}

// --- Aiming at a SPOT, which is what makes this affordable -------------------

/**
 * A release, decomposed — so a caller can perturb it without re-solving.
 *
 * ★ THE SOLVE IS EXPENSIVE AND THE PITCHER DOES NOT DO IT TWICE. `releasePitch`
 * runs a secant over a bisection, each iteration a full 240Hz integration:
 * measured at **13.6ms**, three hundred and fifty times the cost of the flight
 * it produces. PR 8's harness runs ~200,000 pitches, which at that price is
 * forty-nine minutes of solving to produce eight seconds of baseball.
 *
 * The fix is not a faster solver, it is a better model. A pitcher aims at a
 * SPOT — v1 knows this too; its mound UI is a 3x3 grid — and his execution error
 * lands on his RELEASE, not on his intention. So the solve is a property of
 * (kind, arm, spot), a small finite set, and scatter is an angular perturbation
 * of the answer. `releaseAtSpot` memoises the first; `releaseFrom` applies the
 * second. One integration per pitch instead of ninety.
 */
export interface ReleasePlan {
  speedFts: number;
  elevRad: number;
  azRad: number;
  spin: Vec3;
  from: Vec3;
}

/**
 * The nine places a pitcher tries to put it, as fractions of the zone's own
 * half-width and half-height. Zone-relative rather than absolute feet, so the
 * grid follows the batter's zone instead of assuming one.
 */
export const PITCH_SPOTS: ReadonlyArray<{ lateral: number; height: number }> = [
  { lateral: -1, height: -1 }, { lateral: 0, height: -1 }, { lateral: 1, height: -1 },
  { lateral: -1, height: 0 }, { lateral: 0, height: 0 }, { lateral: 1, height: 0 },
  { lateral: -1, height: 1 }, { lateral: 0, height: 1 }, { lateral: 1, height: 1 },
];

/**
 * A pure memo, keyed on everything the answer depends on.
 *
 * Module-level state, and safe: the solve is a deterministic function of its
 * key, so the cache is unobservable except in time. It holds at most
 * (kinds x stats x spots) entries.
 */
const releaseCache = new Map<string, ReleasePlan>();

/** Solve — once — the release that puts `kind` on the given aim point. */
export function releaseAtSpot(opts: {
  kind: PitchKind;
  pitchingStat: number;
  aimHeightFt: number;
  aimLateralFt: number;
}): ReleasePlan {
  const key = `${opts.kind}|${opts.pitchingStat}|${opts.aimHeightFt}|${opts.aimLateralFt}`;
  const hit = releaseCache.get(key);
  if (hit) return hit;

  const state = releasePitch(opts);
  const speedFts = Math.sqrt(
    state.v.x * state.v.x + state.v.y * state.v.y + state.v.z * state.v.z
  );
  const horiz = Math.sqrt(state.v.x * state.v.x + state.v.z * state.v.z);
  const plan: ReleasePlan = {
    speedFts,
    elevRad: Math.atan2(state.v.y, horiz),
    azRad: Math.atan2(state.v.x, state.v.z),
    spin: { ...state.w },
    from: { ...state.p },
  };
  releaseCache.set(key, plan);
  return plan;
}

/** Rebuild a ball from a plan, with the release angles nudged by execution error. */
export function releaseFrom(plan: ReleasePlan, dElevRad = 0, dAzRad = 0): BallState {
  return {
    p: { ...plan.from },
    v: velocityAt(plan.elevRad + dElevRad, plan.azRad + dAzRad, plan.speedFts),
    w: { ...plan.spin },
  };
}

/**
 * The release elevation that puts the ball at `aimHeightFt` when it crosses the
 * plate, for a given speed. Returns null when the plate cannot be reached at
 * that speed at all.
 *
 * ★ THE CROSSING HEIGHT IS NOT MONOTONE IN ELEVATION, and assuming it is costs
 * you the whole pitch. Loft the ball more and it arrives higher — up to a
 * point; past that the extra hang time costs more drop than the loft buys and
 * it starts arriving LOWER again. So the miss function is negative at BOTH ends
 * of any wide bracket, and a plain bisection guard that reads "if the top of
 * the bracket still misses low, return the top" hands back a near-vertical lob.
 * The first version did exactly that and produced a pitch that took 2.7s and
 * crossed 170ft below the plate.
 *
 * So: scan for the peak first, then bisect on the LOW side of it, which is the
 * branch a pitcher actually throws. If even the peak falls short, the arm
 * cannot reach the plate and the caller needs more speed.
 */
function solveElevation(
  from: Vec3,
  speed: number,
  azRad: number,
  spin: Vec3,
  aimHeightFt: number
): number | null {
  const miss = (elev: number) =>
    flyToPlate({ p: { ...from }, v: velocityAt(elev, azRad, speed), w: { ...spin } }).state.p.y -
    aimHeightFt;

  const LO = -0.4;
  const HI = 1.2;
  let peakElev = LO;
  let peakMiss = -Infinity;
  for (let i = 0; i <= PITCH.ELEV_SCAN; i++) {
    const e = LO + ((HI - LO) * i) / PITCH.ELEV_SCAN;
    const m = miss(e);
    if (m > peakMiss) {
      peakMiss = m;
      peakElev = e;
    }
  }
  if (peakMiss < 0) return null; // cannot reach the plate at this speed
  if (miss(LO) >= 0) return LO;

  let lo = LO;
  let hi = peakElev;
  for (let i = 0; i < PITCH.ELEV_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (miss(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function velocityAt(elevRad: number, azRad: number, speed: number): Vec3 {
  const horiz = speed * Math.cos(elevRad);
  return { x: horiz * Math.sin(azRad), y: speed * Math.sin(elevRad), z: horiz * Math.cos(azRad) };
}

/**
 * Fly a released pitch until it reaches the plate (z = 0).
 *
 * Exposed because the batter needs the ball's ACTUAL state at the plate — its
 * speed and where it really crossed — and that is a fact about the trajectory,
 * not a number the pitcher chose.
 */
export function flyToPlate(release: BallState): { state: BallState; travelSec: number } {
  const dt = 1 / FLIGHT_HZ;
  let s = cloneState(release);
  let t = 0;
  const plate: Guard = (b) => b.p.z;
  while (t < PITCH.MAX_FLIGHT_SEC) {
    const r = stepFlight(s, dt, { plate });
    t += r.event ? r.event.tSec : dt;
    s = r.state;
    if (r.event) break;
  }
  return { state: s, travelSec: t };
}

/**
 * A better arm throws genuinely faster.
 *
 * ★ AND IT IS UNCALIBRATED, which the record says out loud.
 * `pace.pitchCorridor.armRatingCaveat`: "the 'ON THE MOUND' panel's PT is a
 * pitches-thrown counter, not a rating, so flight time cannot be bound to a
 * pitcher stat from this footage. The corridor is therefore measured as a RANGE
 * across pitchers and kinds, not a per-stat curve, and ARM_MULT remains
 * uncalibrated." So this is a spread around the one measured flight, not a
 * curve fitted to anything.
 */
export function armMult(pitchingStat: number): number {
  const s = pitchingStat < 1 ? 1 : pitchingStat > 10 ? 10 : pitchingStat;
  // ★ DECREASING in the stat: this multiplies the FLIGHT TIME, so a better arm
  // must produce a SMALLER number. The first version ran the other way and made
  // the best arm on the roster the slowest pitcher in the game — caught by a
  // test asserting that stat 10 throws a shorter flight than stat 1, which is
  // the only reason it did not ship.
  return PITCH.ARM_MULT_MAX - (PITCH.ARM_MULT_MAX - PITCH.ARM_MULT_MIN) * ((s - 1) / 9);
}
