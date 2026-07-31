// ---------------------------------------------------------------------------
// Ball flight: RK4 over gravity + quadratic drag + Magnus, with events resolved
// by BISECTION. PURE.
//
// This file INTEGRATES and REPORTS. It never decides what an event means: it
// says "the ball crossed the ground plane 0.00317 s into this step, at this
// position and velocity". What happens next — a bounce, a carom, a catch, a
// home run — belongs to the caller. Keeping that line is what lets bounce.ts,
// the fielders and the play reducer each own their own rule without three
// copies of the trajectory.
//
// ★ NO ALLOCATION IN THE STAGE MATH. RK4 is four derivative evaluations per
// step; written with Vec3 objects that is ~12 short-lived objects per step,
// which at 240 Hz over a 50,000-plate-appearance harness run is hundreds of
// millions of allocations. The stages here run on plain scalar locals, so the
// only object a step creates is the state it returns. It is also REENTRANT for
// free, which a module-level scratch buffer would not be.
// ---------------------------------------------------------------------------

import { dragCoeff, liftCoeff, spinFactor, BALL_K_PER_FT } from './ball';
import { INTEGRATOR } from './params';
import { G } from './units';
import type { Vec3 } from './field';

/** Position (ft), velocity (ft/s), angular velocity (rad/s). */
export interface BallState {
  p: Vec3;
  v: Vec3;
  /** Angular velocity vector. Its DIRECTION is the spin axis (right-handed:
   *  backspin on a ball travelling +z is -x), its magnitude the spin rate. */
  w: Vec3;
}

/** Integration rate for ball flight, Hz. Typed as `number` rather than the
 *  literal 240: `INTEGRATOR` is `as const`, so without this every helper that
 *  defaults a parameter to it narrows that parameter to 240 and refuses any
 *  other rate — which is exactly what the convergence tests need to pass in. */
export const FLIGHT_HZ: number = INTEGRATOR.FLIGHT_HZ;

/**
 * A guard function: positive before the event, negative after. `stepFlight`
 * bisects for the zero. The ground plane is `s => s.p.y`; a fence at radial
 * distance d is `s => d - hypot(s.p.x, s.p.z)`.
 */
export type Guard = (s: BallState) => number;

export interface FlightEvent {
  /** Seconds into the step at which the guard crossed zero. */
  tSec: number;
  /** The state at the crossing. */
  state: BallState;
}

/** Copy, so a caller can hold a state without aliasing ours. */
export function cloneState(s: BallState): BallState {
  return {
    p: { x: s.p.x, y: s.p.y, z: s.p.z },
    v: { x: s.v.x, y: s.v.y, z: s.v.z },
    w: { x: s.w.x, y: s.w.y, z: s.w.z },
  };
}

/**
 * Acceleration, ft/s^2. Exposed for testing and for callers that want the
 * derivative without stepping; the integrator uses the scalar path below so
 * there is exactly ONE implementation of the physics.
 */
export function accel(s: BallState): Vec3 {
  const out = { x: 0, y: 0, z: 0 };
  accelInto(s.v.x, s.v.y, s.v.z, s.w.x, s.w.y, s.w.z, out);
  return out;
}

/**
 * The force model, on scalars, writing into `out`.
 *
 *   a = -K*Cd*|v|*v  +  K*Cl*|v|*(w_hat x v)  -  g*y_hat
 *
 * Drag depends on the spin RATE; lift on the spin FACTOR S = R*w/|v|. Both are
 * pure arithmetic — no transcendental is reachable from here, which is what
 * keeps the whole sim bit-stable across V8 versions.
 */
function accelInto(
  vx: number,
  vy: number,
  vz: number,
  wx: number,
  wy: number,
  wz: number,
  out: Vec3
): void {
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const spin = Math.sqrt(wx * wx + wy * wy + wz * wz);

  if (speed === 0) {
    out.x = 0;
    out.y = -G;
    out.z = 0;
    return;
  }

  const kv = BALL_K_PER_FT * speed;
  const cd = dragCoeff(spin);
  const cl = liftCoeff(spinFactor(spin, speed));

  // Drag, opposing velocity.
  let ax = -kv * cd * vx;
  let ay = -kv * cd * vy;
  let az = -kv * cd * vz;

  // Magnus, along w_hat x v. Skipped entirely when there is no spin, both
  // because the force is zero and because w_hat is undefined there.
  if (spin > 0 && cl > 0) {
    const ux = wx / spin;
    const uy = wy / spin;
    const uz = wz / spin;
    const m = kv * cl;
    ax += m * (uy * vz - uz * vy);
    ay += m * (uz * vx - ux * vz);
    az += m * (ux * vy - uy * vx);
  }

  out.x = ax;
  out.y = ay - G;
  out.z = az;
}

/** One RK4 step of `dt`, ignoring events. Spin is held constant (see params). */
function rk4(s: BallState, dt: number, out: BallState, a: Vec3): void {
  const { x: px, y: py, z: pz } = s.p;
  const { x: vx, y: vy, z: vz } = s.v;
  const { x: wx, y: wy, z: wz } = s.w;
  const h = dt / 2;

  // k1
  accelInto(vx, vy, vz, wx, wy, wz, a);
  const k1vx = a.x, k1vy = a.y, k1vz = a.z;
  const k1px = vx, k1py = vy, k1pz = vz;

  // k2
  accelInto(vx + k1vx * h, vy + k1vy * h, vz + k1vz * h, wx, wy, wz, a);
  const k2vx = a.x, k2vy = a.y, k2vz = a.z;
  const k2px = vx + k1vx * h, k2py = vy + k1vy * h, k2pz = vz + k1vz * h;

  // k3
  accelInto(vx + k2vx * h, vy + k2vy * h, vz + k2vz * h, wx, wy, wz, a);
  const k3vx = a.x, k3vy = a.y, k3vz = a.z;
  const k3px = vx + k2vx * h, k3py = vy + k2vy * h, k3pz = vz + k2vz * h;

  // k4
  accelInto(vx + k3vx * dt, vy + k3vy * dt, vz + k3vz * dt, wx, wy, wz, a);
  const k4vx = a.x, k4vy = a.y, k4vz = a.z;
  const k4px = vx + k3vx * dt, k4py = vy + k3vy * dt, k4pz = vz + k3vz * dt;

  const s6 = dt / 6;
  out.p.x = px + s6 * (k1px + 2 * k2px + 2 * k3px + k4px);
  out.p.y = py + s6 * (k1py + 2 * k2py + 2 * k3py + k4py);
  out.p.z = pz + s6 * (k1pz + 2 * k2pz + 2 * k3pz + k4pz);
  out.v.x = vx + s6 * (k1vx + 2 * k2vx + 2 * k3vx + k4vx);
  out.v.y = vy + s6 * (k1vy + 2 * k2vy + 2 * k3vy + k4vy);
  out.v.z = vz + s6 * (k1vz + 2 * k2vz + 2 * k3vz + k4vz);
  out.w.x = wx;
  out.w.y = wy;
  out.w.z = wz;
}

/**
 * Advance by `dtSec`. If any guard crosses zero during the step, the returned
 * state is the state AT THE CROSSING and `event` names which guard and when.
 *
 * ★ THE CROSSING IS FOUND BY BISECTING THE INTEGRATOR, NOT BY SHRINKING THE
 * STEP. Every trial re-integrates from the START of the step by a candidate
 * dt, so the crossing state is a real RK4 solution rather than a linear
 * interpolation between two samples — which is what keeps the answer
 * independent of where the step boundary happened to fall. `flight.test.ts`
 * sweeps the step phase across a whole period and requires the resolved
 * crossing to move by less than 0.01 ft; a step-size implementation fails that
 * conspicuously.
 */
export function stepFlight(
  s: BallState,
  dtSec: number,
  guards: Record<string, Guard> = {}
): { state: BallState; event: (FlightEvent & { kind: string }) | null } {
  const a: Vec3 = { x: 0, y: 0, z: 0 };
  const end = cloneState(s);
  rk4(s, dtSec, end, a);

  // Which guards were non-negative at the start and went negative by the end?
  let firstKind: string | null = null;
  let firstT = Infinity;
  const trial = cloneState(s);

  for (const kind of Object.keys(guards)) {
    const g = guards[kind];
    if (!(g(s) >= 0) || !(g(end) < 0)) continue;

    let lo = 0;
    let hi = dtSec;
    for (let i = 0; i < INTEGRATOR.EVENT_MAX_ITERS && hi - lo > INTEGRATOR.EVENT_TOL_SEC; i++) {
      const mid = (lo + hi) / 2;
      rk4(s, mid, trial, a);
      if (g(trial) >= 0) lo = mid;
      else hi = mid;
    }
    if (hi < firstT) {
      firstT = hi;
      firstKind = kind;
    }
  }

  if (firstKind === null) return { state: end, event: null };

  const at = cloneState(s);
  rk4(s, firstT, at, a);
  return { state: at, event: { kind: firstKind, tSec: firstT, state: at } };
}

/**
 * Linear interpolation between two integrator samples, for the renderer.
 *
 * ★ Exposed NOW, before any renderer exists, because it is the seam that keeps
 * the sim from knowing frames exist. `render/bridge.ts` will hold the
 * fixed-timestep accumulator's remainder and ask for a state at `alpha` in
 * [0,1); retrofitting that later means threading alpha through every state
 * type the sim returns. Linear is correct here: at 240 Hz consecutive samples
 * are 4 ms apart, far below anything a 60 Hz display can resolve.
 */
export function sampleAt(a: BallState, b: BallState, alpha: number): BallState {
  const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  const l = (u: number, v: number) => u + (v - u) * t;
  return {
    p: { x: l(a.p.x, b.p.x), y: l(a.p.y, b.p.y), z: l(a.p.z, b.p.z) },
    v: { x: l(a.v.x, b.v.x), y: l(a.v.y, b.v.y), z: l(a.v.z, b.v.z) },
    w: { x: l(a.w.x, b.w.x), y: l(a.w.y, b.w.y), z: l(a.w.z, b.w.z) },
  };
}

/** The ground plane guard. Positive above the turf. */
export const groundGuard: Guard = (s) => s.p.y;
