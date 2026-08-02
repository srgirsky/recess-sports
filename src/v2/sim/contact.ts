// ---------------------------------------------------------------------------
// Bat meets ball. PURE.
//
// ★ THIS IS THE FILE v2 EXISTS FOR. v1's `buildLaunch` rolls a CATEGORY
// ('grounder' | 'liner' | 'fly'), looks the distance up in a table, lerps a
// hang time out of `depth`, and decides the home run at the moment of contact
// with `q > HR_Q * (dirLen/refLen)^2`. The ball has no position between contact
// and its landing spot: there is no trajectory, no exit velocity, no launch
// angle and no spin. Whether a ball is a home run is an INPUT there.
//
// Here the swing produces exit velocity, launch angle, spray and spin, and
// hands them to the integrator. Whether anything is a home run, a gap double or
// a lazy fly is then a fact about where the ball went.
//
// ★ THE PHYSICS IS AN IDENTITY, NOT A FIT.
//
//   Nathan (Am. J. Phys. 71(2) 134-143, 2003), Eq. 3:
//       v_f = e_A * v_ball + (1 + e_A) * v_bat
//   derived "from nothing other than the definition of e_A followed by a change
//   of inertial reference frame". Exact for any ball, bat or collision model.
//   e_A itself comes from Eq. 6, e_A = (e - r)/(1 + r) with r = m/M_eff.
//
//   The oblique half reuses the grip/slip result already derived and verified
//   in `bounce.ts` — the ball meeting a bat off-centre is the same problem as a
//   ball meeting the ground off-square. Kensrud, Nathan & Smith
//   (arXiv:1610.03464) measured that the ball GRIPS the bat rather than rolling,
//   "resulting in a spin that was up to 40% greater than would be obtained by
//   rolling contact of rigid bodies", and that both exit speed and spin scale
//   LINEARLY with bat speed. All three are asserted in contact.test.ts.
//
// ★ ON TRIG. This file uses `Math.asin`/`sin`/`cos` to turn the contact
// GEOMETRY into an angle, exactly as `launch.ts` does and for the same reason:
// it is a once-per-swing conversion, not a per-step force term. The per-step
// path (`flight.ts`, `ball.ts`) is separately lint-checked to have none. A
// residual determinism risk that is confined and recorded, not eliminated.
//
// ★ AND NO `sprayT` THUNK. v1 passes spray as a THUNK so "a caller's rng rolls
// stay in the exact order the seeded tests expect" — a real constraint there,
// because one global stream made draw ORDER part of the contract. `Rng.fork`
// derives substreams from (seed, label) and never from stream position, so that
// entire class is gone. The reason is ported; the mechanism is not.
// ---------------------------------------------------------------------------

import type { Character } from '../../data/types';
import { BALL, BAT, resolvePlate, type PlateParams } from './params';
import { BALL_RADIUS_FT } from './ball';
import { batSpeedFts } from './athletes';
import { ftsToMph, mphToFts, clamp } from './units';
import type { Rng } from './rng';
import type { LaunchSpec } from './launch';

/** What the batter did. Timing is signed: negative is early. */
export interface SwingSpec {
  /** Seconds by which the swing led (negative) or trailed (positive) the ball. */
  timingErrorSec: number;
  /**
   * Where the barrel's centre passed relative to the ball's centre, ft.
   * POSITIVE is under the ball (an undercut, which lifts and backspins it);
   * negative is over the top (which chops it into the ground).
   */
  undercutFt: number;
  batter: Character;
  /** The pitch's flight time, seconds. The swing window is a fraction of it. */
  travelSec: number;
  /** Pitch speed at the plate, ft/s. */
  pitchSpeedFts: number;
  /** Resolved plate constants. Omit for the shipped values. */
  plate?: PlateParams;
}

export type SwingResult =
  | { kind: 'miss' }
  | { kind: 'foulTip' }
  | { kind: 'contact'; launch: LaunchSpec; exitVelocityFts: number };

/**
 * Nathan Eq. 6. The collision efficiency, DERIVED from the ball-bat COR and the
 * bat's recoil factor rather than stated — so `EFFECTIVE_MASS_OZ` and `e_A` can
 * never drift apart.
 */
export function collisionEfficiency(effectiveMassOz: number = BAT.EFFECTIVE_MASS_OZ): number {
  const r = BALL.MASS_OZ / effectiveMassOz; // bat recoil factor
  return (BAT.BALL_BAT_COR - r) / (1 + r);
}

/** Nathan Eq. 3. Exact, given e_A. */
export function exitVelocity(eA: number, pitchSpeed: number, batSpeed: number): number {
  return eA * pitchSpeed + (1 + eA) * batSpeed;
}

/**
 * How square the contact was, 0..1, from the timing error.
 *
 * The window is a FRACTION of the flight (see `BAT.CONTACT_WINDOW_FRAC`), which
 * is what makes `pace.swingWindows`'s structural invariant — "CONTACT must stay
 * below the FASTEST possible travelMs" — true by construction instead of by
 * assertion. v1 compares absolute milliseconds and can only assert it.
 */
export function timingQuality(timingErrorSec: number, travelSec: number): number {
  const e = Math.abs(timingErrorSec);
  const contact = BAT.CONTACT_WINDOW_FRAC * travelSec;
  const perfect = BAT.PERFECT_WINDOW_FRAC * travelSec;
  if (e >= contact) return 0;
  if (e <= perfect) return 1;
  return 1 - (e - perfect) / (contact - perfect);
}

/**
 * Resolve a swing into a batted ball.
 *
 * The chain, in order:
 *   1. bat speed from `power`, degraded by how square the contact was;
 *   2. the undercut sets the line of centres, hence the LAUNCH ANGLE;
 *   3. the tangential component at that contact sets the BACKSPIN, through the
 *      same grip result the ground bounce uses, times the measured 1.4x;
 *   4. Nathan Eq. 3 gives the EXIT VELOCITY;
 *   5. timing sets the SPRAY — early pulls, late goes the other way.
 */
export function resolveSwing(spec: SwingSpec, rng: Rng): SwingResult {
  const q = timingQuality(spec.timingErrorSec, spec.travelSec);
  const ability = spec.batter.ability;
  const plate = spec.plate ?? resolvePlate();

  // ★ The ability hooks, reinterpreted for a bandless model. v1 applies them as
  // band up/downgrades in a load-bearing ORDER; the order survives even though
  // the bands do not.
  //
  // `never_strikes_out`: v1 turns a miss into weak contact. Here it is a floor
  // on contact quality — she never whiffs, but a badly timed swing is still a
  // dribbler.
  let quality = q;
  if (ability === 'never_strikes_out') quality = Math.max(quality, 0.12);

  if (quality <= 0) return { kind: 'miss' };

  // A glancing edge: enough of the bat to touch it, not enough to drive it.
  const r = rng.fork('foulTip');
  if (quality < 0.18 && r() < 0.45) return { kind: 'foulTip' };

  // 1. Bat speed. Off-square contact costs speed at the point of impact and
  //    moves the ball off the sweet spot, which costs e_A too.
  const batSpeed = batSpeedFts(spec.batter.stats.power) * (0.7 + 0.3 * quality);
  const offSweetFt = (1 - quality) * BAT.SWEET_SPOT_SPAN_FT;
  const sweetness = clamp(1 - offSweetFt / BAT.SWEET_SPOT_SPAN_FT, 0, 1);
  const eA = collisionEfficiency() * sweetness;

  // 2. Contact geometry. The bat's centre passes `undercutFt` below the ball's,
  //    so the line of centres — along which the ball leaves — is tilted up by
  //    asin(undercut / (r_ball + r_barrel)).
  //
  // ★ BEYOND THAT SEPARATION THE BAT MISSES THE BALL, and for three PRs this
  // line CLAMPED instead. The sentence above is what the code always said it
  // meant; a clamp means the opposite. A bat passing more than 2.70 inches from
  // the ball's centre does not graze it at the steepest angle two circles can
  // touch at — it goes by underneath. `asin(±1)` is exactly ±90 degrees, so
  // every one of those swings was recorded as a ball hit perfectly straight up
  // or straight down.
  //
  // PR 8's harness is what saw it, and it is the reason a distribution is worth
  // more than a total: `GameTally` counted these as balls in play and was right
  // to, `sim.gameShape` reported a plausible strikeout rate, and nothing looked
  // wrong until 22% of fair balls stacked into a single 5-degree bin at the top
  // of the histogram and 8% more at the bottom. Measured before the fix: a kid
  // with contact 1 saturates beyond 0.74 sigma of his own vertical read, so
  // 46% of his swings were arriving as vertical pop-ups.
  const centreSep = BALL_RADIUS_FT + BAT.BARREL_RADIUS_FT;
  let offset = spec.undercutFt;
  if (Math.abs(offset) > centreSep) {
    // ★ THE ONE CASE THE CLAMP SURVIVES, because the content asks for it.
    // `never_strikes_out` already floors timing quality above; a bat that misses
    // on the VERTICAL axis would strike her out through the other door and make
    // the ability a half-promise. She is pulled back to the edge of the barrel —
    // a real graze, and the worst contact the geometry allows — rather than
    // exempted from geometry.
    if (ability !== 'never_strikes_out') return { kind: 'miss' };
    offset = clamp(offset, -centreSep, centreSep);
  }
  // ★ THE UNDERCUT IS PERPENDICULAR TO THE BAT'S PATH, so the angle it produces
  // is measured in the BAT'S frame and the swing plane's own tilt adds to it.
  // Without that term the distribution is exactly zero-mean and every kid swings
  // dead level — see `BAT.ATTACK_ANGLE_DEG` and `sim.swingPlane`.
  const launchAngleDeg =
    plate.attackAngleDeg + (Math.asin(offset / centreSep) * 180) / Math.PI;

  // 3. Exit velocity, Nathan Eq. 3.
  const exitVelocityFts = Math.max(0, exitVelocity(eA, spec.pitchSpeedFts, batSpeed));

  // 4. Backspin. The relative surface velocity tangential to the line of
  //    centres is what friction acts on; gripping it gives (5/7) of that at the
  //    contact, hence a spin of (5/7)*v_t/R — the same result as the ground
  //    bounce. Times the measured grip enhancement.
  const vRel = spec.pitchSpeedFts + batSpeed;
  const tangential = vRel * Math.sin(Math.asin(offset / centreSep));
  const spinRadS = ((5 / 7) * Math.abs(tangential) * BAT.GRIP_SPIN_ENHANCEMENT) / BALL_RADIUS_FT;
  const spinRpm = (spinRadS * 60) / (2 * Math.PI) * (offset >= 0 ? 1 : -1);

  // 5. Spray. Timing decides where in front of the plate the bat met the ball;
  //    meeting it early means meeting it out front, which pulls.
  const depthFt = -spec.timingErrorSec * spec.pitchSpeedFts;
  let sprayDeg = clamp(depthFt * plate.pullDegPerFt, -60, 60);
  // Right-handed batters pull to left field, which is negative spray.
  sprayDeg = -sprayDeg;

  return {
    kind: 'contact',
    exitVelocityFts,
    launch: {
      exitVelocityFts,
      launchAngleDeg,
      sprayDeg,
      spinRpm,
      heightFt: 2.5,
    },
  };
}

/** Exit velocity in mph, for records and demos that speak that language. */
export function exitVelocityMph(eA: number, pitchMph: number, batMph: number): number {
  return ftsToMph(exitVelocity(eA, mphToFts(pitchMph), mphToFts(batMph)));
}
