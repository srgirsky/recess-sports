// ---------------------------------------------------------------------------
// What happens when the ball meets something solid: ground bounce, roll, wall
// carom, obstacle. PURE, and no `Rng` — every one of these is deterministic on
// purpose, the same way v1's `moveBall`/`maybeCarom`/`ballHitObstacle` are, so
// a seeded game stays byte-identical.
//
// `flight.ts` integrates and REPORTS a crossing; this file decides what the
// crossing MEANS. That division is why the trajectory exists in exactly one
// place while the ground, the wall, the oak and (later) a fielder's glove can
// each own their own rule.
//
// ★ THE TANGENTIAL RESULT IS DERIVED, NOT REMEMBERED.
//
// At an impact, friction acts at the contact point. If it can supply enough
// impulse, it stops that point dead — the ball GRIPS. Solving the impulse
// problem for a sphere (I = 2/5 mR^2, contact one radius below the centre):
//
//     v1 = v + J/m ,  w1 = w + RJ/I ,  require  v1 + w1*R = 0
//  => J = -(2/7) m (v + wR)                        [the grip impulse]
//  => v1 = (5v - 2wR) / 7
//
// The MINUS is the part memory gets wrong, and it is the whole point: a ball
// with enough backspin comes off the ground going BACKWARD. Checked three ways
// in bounce.test.ts — pure rolling in gives zero impulse, no spin gives exactly
// 5/7, and angular momentum about the contact point is conserved.
//
// ★ AND A CITED LIMIT. Cross, "Grip-slip behavior of a bouncing ball", Am. J.
// Phys. 70(11) 1093-1102 (2002), measured that REAL balls do not roll when they
// bounce: the contact region deforms and grips, the friction force reverses
// direction mid-bounce, and the resulting spin is LARGER than the rolling
// prediction. So the grip branch here is a lower bound on spin reversal, not
// the last word. Recorded in `sim.bounceModel` as a known simplification
// rather than left to be rediscovered.
//
// ON TRIG. `rollStep` runs every tick and is pure arithmetic. `wallCarom` runs
// ONCE per wall contact, which is the same once-per-event boundary the purity
// lint's own rationale already allows for `launch` — but note that it reaches
// `fenceNormalAt`, which uses trig internally. The lint only reads a file's own
// text, so it would not catch a per-step caller importing trig transitively.
// Keep caroms on events.
// ---------------------------------------------------------------------------

import { BOUNCE } from './params';
import { BALL_RADIUS_FT } from './ball';
import { G } from './units';
import { INTEGRATOR } from './params';
import { cloneState, groundGuard, stepFlight, type BallState, type Guard } from './flight';
import {
  clampToField,
  distFromHome,
  fenceDistAt,
  fenceNormalAt,
  sprayOf,
  type FieldGeometry,
  type Obstacle,
  type Vec2,
} from './field';

/** Ground restitution for a venue: the base constant times its liveliness. */
export function groundCor(geo: FieldGeometry): number {
  return BOUNCE.COR_BASE * geo.bounceMult;
}

/**
 * One ground impact.
 *
 * Vertical: `vy' = -e*vy`. Horizontal: grip if friction can stop the contact
 * point, otherwise slip with the full Coulomb impulse opposing the slip.
 *
 * Spin is updated from the SAME impulse in both branches — which is what makes
 * a gripped bounce leave the ball rolling rather than spinning in place.
 */
export function groundBounce(s: BallState, geo: FieldGeometry): BallState {
  const out = cloneState(s);
  const e = groundCor(geo);
  const R = BALL_RADIUS_FT;

  // Normal. Only a DOWNWARD impact rebounds; a ball already moving up at the
  // plane is left alone, so a caller that mis-fires cannot pump energy in.
  const vyIn = s.v.y;
  out.v.y = vyIn < 0 ? -e * vyIn : vyIn;

  // Contact-point horizontal velocity: u = v_t + w x (-R * yhat).
  // w x (-R yhat) = -R (w x yhat), and (w x yhat) = (wz*1 - 0, 0, -wx) in
  // (x, y, z) terms => contributes (-R*wz, 0, R*wx) ... written out per axis:
  const ux = s.v.x + R * s.w.z;
  const uz = s.v.z - R * s.w.x;
  const uMag = Math.sqrt(ux * ux + uz * uz);

  if (uMag > 0) {
    // Impulse per unit mass needed to bring the contact point to rest.
    const jGrip = (2 / 7) * uMag;
    // Impulse per unit mass Coulomb friction can actually supply over the
    // impact: mu * (1 + e) * |vy_in|.
    const jMax = BOUNCE.MU_GROUND * (1 + e) * Math.abs(vyIn);
    const j = jGrip <= jMax ? jGrip : jMax;

    // Applied opposing the slip direction.
    const dx = -(ux / uMag) * j;
    const dz = -(uz / uMag) * j;
    out.v.x = s.v.x + dx;
    out.v.z = s.v.z + dz;

    // Same impulse, angular side. Torque per unit mass about the centre is
    // (-R*yhat) x J = (-R*dz, 0, R*dx), and I per unit mass is (2/5)R^2, so
    // dw = (5/(2R)) * (-dz, 0, dx). Spin about the vertical (sidespin) is
    // untouched: a horizontal impulse at the bottom of the ball exerts no
    // torque about y.
    const k = 5 / (2 * R);
    out.w.x = s.w.x - k * dz;
    out.w.z = s.w.z + k * dx;
  }

  // ★ Leave the ball ON the plane, never under it. `stepFlight` only fires a
  // guard that was non-negative at the start of a step, so a ball left at
  // y < 0 would never trigger the ground again — it would sink silently.
  if (out.p.y < 0) out.p.y = 0;
  return out;
}

/** True once the ball is too slow to keep bouncing. */
export function isRollingNow(s: BallState): boolean {
  return Math.abs(s.v.y) < BOUNCE.REST_BOUNCE_FTS && s.p.y <= BALL_RADIUS_FT;
}

/** True once the ball has stopped altogether. */
export function isAtRest(s: BallState): boolean {
  const ground = Math.sqrt(s.v.x * s.v.x + s.v.z * s.v.z);
  return ground < BOUNCE.REST_ROLL_FTS && Math.abs(s.v.y) < BOUNCE.REST_BOUNCE_FTS;
}

/**
 * Advance a ball that is rolling on the ground: `a = -mu_r * g` opposing
 * motion, and never past a dead stop.
 *
 * Analytic consequence a test checks: a ball rolling at v covers exactly
 * `v^2 / (2 mu g)` before stopping.
 */
export function rollStep(s: BallState, geo: FieldGeometry, dtSec: number): BallState {
  const out = cloneState(s);
  const speed = Math.sqrt(s.v.x * s.v.x + s.v.z * s.v.z);
  if (speed <= 0) {
    out.v.x = 0;
    out.v.z = 0;
    return out;
  }

  const decel = geo.rollFriction * G * dtSec;
  const next = speed - decel;

  // ★ Finish the roll ANALYTICALLY once it drops below the rest threshold,
  // instead of just declaring it stopped where it happens to be. The threshold
  // decides when we stop SIMULATING; it must not decide where the ball ends up,
  // or the resting spot depends on the tick rate. Truncating here cost 0.014ft
  // of a 5.55ft roll and made the whole thing step-size dependent.
  if (next <= BOUNCE.REST_ROLL_FTS) {
    const travel = (speed * speed) / (2 * geo.rollFriction * G);
    out.p.x = s.p.x + (s.v.x / speed) * travel;
    out.p.z = s.p.z + (s.v.z / speed) * travel;
    out.p.y = 0;
    out.v.x = 0;
    out.v.z = 0;
    out.v.y = 0;
    out.w.x = 0;
    out.w.y = 0;
    out.w.z = 0;
    return containRoll(out, s, geo);
  }

  const mid = (speed + next) / 2; // exact for constant deceleration
  out.p.x = s.p.x + (s.v.x / speed) * mid * dtSec;
  out.p.z = s.p.z + (s.v.z / speed) * mid * dtSec;
  out.p.y = 0;
  out.v.x = (s.v.x / speed) * next;
  out.v.z = (s.v.z / speed) * next;
  out.v.y = 0;
  // Rolling without slipping: the spin follows the ground speed.
  out.w.x = out.v.z / BALL_RADIUS_FT;
  out.w.y = 0;
  out.w.z = -out.v.x / BALL_RADIUS_FT;
  return containRoll(out, s, geo);
}

/**
 * A rolling ball hits the wall too.
 *
 * ★ Rolling containment lives HERE rather than in the caller, and that is not
 * tidiness. `stepFlight`'s guards only run while the ball is airborne, so once
 * it settles into a roll nothing else is watching the fence — a grounder down
 * the line simply rolled out of the park. Caught by the "comes to rest inside
 * the field" sweep, at sandlot spray 40: the ball came to rest 373ft from home
 * against a 156ft fence. Putting it in `rollStep` makes "a rolling ball stays
 * in the field" true by construction instead of by caller discipline, which is
 * the same reason v1 calls `maybeCarom` from inside its rollout.
 */
function containRoll(out: BallState, from: BallState, geo: FieldGeometry): BallState {
  const spray = sprayOf({ x: out.p.x, z: out.p.z });
  const limit = fenceDistAt(geo, spray);
  if (distFromHome({ x: out.p.x, z: out.p.z }) <= limit) return out;

  // Put it back on the wall, then carom whatever speed it still has.
  const back = cloneState(out);
  back.p.x = from.p.x;
  back.p.z = from.p.z;
  back.v.x = out.v.x;
  back.v.z = out.v.z;
  const caromed = wallCarom(back, geo);
  const p = clampToField(geo, { x: caromed.p.x, z: caromed.p.z }, BOUNCE.BALL_SETTLE_MARGIN_FT);
  caromed.p.x = p.x;
  caromed.p.z = p.z;
  caromed.p.y = 0;
  return caromed;
}

/**
 * A carom off the outfield wall.
 *
 * ★ HEIGHT IS CHECKED HERE, because `isBeyondFence`'s docstring says "Height is
 * the caller's job" and this is the caller. v1 had no height check at all, so
 * a fly ball two hundred feet up caromed off the wall it was clearing. Above
 * `fenceHeight` this returns the ball UNCHANGED — it is a home run, and that is
 * the play reducer's call to make, not this file's.
 */
export function wallCarom(s: BallState, geo: FieldGeometry): BallState {
  if (s.p.y > geo.fenceHeight) return cloneState(s);

  const spray = sprayOf({ x: s.p.x, z: s.p.z });
  const n = fenceNormalAt(geo, spray);

  const dot = s.v.x * n.x + s.v.z * n.z;
  // ★ Already heading back into the field: do NOT reflect again. Without this
  // a ball resting against the wall flips its velocity every tick and jitters
  // in place — v1 carries the same guard for the same reason.
  if (dot >= 0) return cloneState(s);

  const out = cloneState(s);
  // Decompose into normal and tangential, and treat them separately: the wall
  // takes energy out of the normal component (restitution) and rather less out
  // of the tangential one, which is what makes a ball down the line skid along
  // the wall instead of stopping dead.
  const vnx = dot * n.x;
  const vnz = dot * n.z;
  const vtx = s.v.x - vnx;
  const vtz = s.v.z - vnz;

  out.v.x = vtx * BOUNCE.WALL_TANGENTIAL_KEEP - vnx * geo.wallRestitution;
  out.v.z = vtz * BOUNCE.WALL_TANGENTIAL_KEEP - vnz * geo.wallRestitution;
  out.v.y = s.v.y * geo.wallRestitution;

  // ★ Snap back INSIDE the wall before returning. `stepFlight` never fires a
  // guard that was already negative at the start of a step, so a ball left
  // outside the fence would tunnel and stick there forever.
  const limit = fenceDistAt(geo, spray) - BOUNCE.BALL_SETTLE_MARGIN_FT;
  const r = distFromHome({ x: out.p.x, z: out.p.z });
  if (r > limit && r > 0) {
    const k = limit / r;
    out.p.x = out.p.x * k;
    out.p.z = out.p.z * k;
  }
  return out;
}

/**
 * The oak. It stops the ball dead — no deflection, no restitution: a ball into
 * a tree drops out of it. Above the canopy it is not there at all.
 */
export function obstacleBonk(s: BallState, o: Obstacle): BallState {
  const out = cloneState(s);
  if (s.p.y > o.heightFt) return out;
  out.v.x = 0;
  out.v.y = 0;
  out.v.z = 0;
  out.w.x = 0;
  out.w.y = 0;
  out.w.z = 0;
  return out;
}

/**
 * The one contract for "the ball has stopped here" — v1's `settleBallAt`, which
 * exists because every settle site must clamp. A resting ball outside the
 * playable region is unreachable, and the play then burns its whole length cap
 * with a fielder pressed against the boundary.
 */
export function settleBallAt(s: BallState, geo: FieldGeometry): BallState {
  const p = clampToField(geo, { x: s.p.x, z: s.p.z }, BOUNCE.BALL_SETTLE_MARGIN_FT);
  return {
    p: { x: p.x, y: 0, z: p.z },
    v: { x: 0, y: 0, z: 0 },
    w: { x: 0, y: 0, z: 0 },
  };
}

// --- The whole life of a loose ball -----------------------------------------

/** Where the ball is, how high, and when. */
export interface PathSample {
  p: Vec2;
  /** Height above the turf, ft. The election ignores it; a catch test does not. */
  h: number;
  tSec: number;
}

export interface LooseTrace {
  /** Sampled path, oldest first, `tSec` measured from the trace's start. */
  samples: PathSample[];
  /** Where it comes to rest, clamped into the field. */
  settle: Vec2;
  /** When it gets there. */
  restAtSec: number;
  /** Where it first touches down, and when. Null if it never does (a home run,
   *  or a ball that was already on the ground when the trace began). */
  landing: Vec2 | null;
  landAtSec: number | null;
  /** It cleared the fence instead. Nobody is fielding this one. */
  leftPark: boolean;
}

/**
 * Fly, bounce, roll and carom a loose ball until it stops.
 *
 * ★ THE SAME FUNCTION ANSWERS "WHERE IS IT GOING" AND "WHERE DID IT GO", and
 * that closes a caveat v1 wrote into `fielding.ts` and could not remove.
 * v1's `predictLoosePath` is "an ELECTION-ONLY estimate, deliberately not a
 * second copy of `moveBall`", and it hedges that "a divergence changes who gets
 * sent, never where the ball actually goes" — a real second implementation with
 * a real second set of bugs, kept only because the first one was tangled up in
 * the tick reducer. Here the composition is already a pure function of a ball
 * and a field, so the chaser election calls the physics rather than a sketch of
 * it, and there is no divergence to bound.
 *
 * Deliberately NO `Rng`: like everything else in this file, a loose ball is
 * deterministic. The errors live on the fielder, not on the ball.
 */
export function traceLooseBall(
  from: BallState,
  geo: FieldGeometry,
  opts: { horizonSec?: number; samples?: number; dtSec?: number } = {}
): LooseTrace {
  const horizon = opts.horizonSec ?? 8;
  const want = opts.samples ?? 24;
  const dt = opts.dtSec ?? 1 / INTEGRATOR.FLIGHT_HZ;

  const guards: Record<string, Guard> = { ground: groundGuard, fence: fenceGuard(geo) };
  for (let i = 0; i < geo.obstacles.length; i++) guards[`obstacle${i}`] = obstacleGuard(geo.obstacles[i]);

  let s = cloneState(from);
  let t = 0;
  let rolling = isRollingNow(s) && s.p.y <= 0;
  let leftPark = false;
  let landing: Vec2 | null = null;
  let landAtSec: number | null = null;
  const samples: PathSample[] = [{ p: { x: s.p.x, z: s.p.z }, h: s.p.y, tSec: 0 }];
  const every = horizon / want;
  let nextSample = every;

  while (t < horizon && !(rolling && isAtRest(s))) {
    if (rolling) {
      s = rollStep(s, geo, dt);
      t += dt;
    } else {
      const r = stepFlight(s, dt, guards);
      t += r.event ? r.event.tSec : dt;
      s = r.state;
      if (r.event) {
        if (r.event.kind === 'fence') {
          if (s.p.y > geo.fenceHeight) {
            leftPark = true;
            break;
          }
          s = wallCarom(s, geo);
        } else if (r.event.kind === 'ground') {
          if (landing === null) {
            landing = { x: s.p.x, z: s.p.z };
            landAtSec = t;
          }
          s = isRollingNow(s) ? s : groundBounce(s, geo);
          if (isRollingNow(s)) {
            s.p.y = 0;
            rolling = true;
          }
        } else {
          const idx = Number(r.event.kind.slice('obstacle'.length));
          s = obstacleBonk(s, geo.obstacles[idx]);
          rolling = true;
        }
      }
    }
    if (t >= nextSample) {
      samples.push({ p: { x: s.p.x, z: s.p.z }, h: s.p.y, tSec: t });
      nextSample += every;
    }
  }

  const settled = settleBallAt(s, geo);
  const settle = { x: settled.p.x, z: settled.p.z };

  // ★ A TAIL OF SAMPLES AT THE RESTING SPOT, which v1 also carries and for the
  // same reason: a ball lying still is still gettable. Without it a fielder who
  // cannot beat the ball to any point ON its path is scored as unable to field
  // it at all, and every slow roller past the infield becomes nobody's ball.
  for (let i = 1; i <= 4; i++) samples.push({ p: { ...settle }, h: 0, tSec: t + i * every });

  return { samples, settle, restAtSec: t, landing, landAtSec, leftPark };
}

// --- Guards, to hand to stepFlight ------------------------------------------

/**
 * Positive while the ball is inside the fence.
 *
 * Note this is a RADIAL test and says nothing about height — a ball clearing
 * the wall crosses it too. `wallCarom` is what distinguishes the two, and it
 * returns the ball untouched when it is over the top.
 */
export function fenceGuard(geo: FieldGeometry): Guard {
  return (s) => {
    const p = { x: s.p.x, z: s.p.z };
    return fenceDistAt(geo, sprayOf(p)) - distFromHome(p);
  };
}

/** Positive while the ball is outside the obstacle's cylinder. */
export function obstacleGuard(o: Obstacle): Guard {
  return (s) => {
    const dx = s.p.x - o.x;
    const dz = s.p.z - o.z;
    return Math.sqrt(dx * dx + dz * dz) - o.r;
  };
}
