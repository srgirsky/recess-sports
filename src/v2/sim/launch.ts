// ---------------------------------------------------------------------------
// Turning a described batted ball — exit velocity, launch angle, spray, spin —
// into the initial `BallState` the integrator advances. PURE.
//
// ★ WHY THIS IS ITS OWN FILE, and not two functions inside flight.ts.
//
// It is the ONE place in the sim that converts an authored ANGLE into a vector,
// so it is the one place that needs `Math.sin`/`Math.cos`. Those are
// implementation-approximated in ECMAScript (only + - * / and Math.sqrt are
// required to be correctly rounded), and `purity.lint.test.js` therefore
// forbids trig on the per-step force path — `flight.ts` and `ball.ts` are
// checked to be free of it, so the thing evaluated 240 times a second cannot
// drift between engines.
//
// This conversion runs ONCE per batted ball. That is a residual determinism
// risk rather than a removed one, and it is recorded as such: it is confined
// here, at the boundary, where it is one call and reviewable, instead of being
// smeared through the integrator. (`field.ts` has the same property for the
// same reason — `sprayOf`, `pointAt`.)
//
// PR 4's `contact.ts` computes exit velocity, launch angle, spray and spin from
// where and when the bat met the ball; this is the seam it will hand off to.
// ---------------------------------------------------------------------------

import type { BallState } from './flight';

export interface LaunchSpec {
  exitVelocityFts: number;
  /** Degrees above horizontal. */
  launchAngleDeg: number;
  /** Degrees; 0 is dead centre (+z), negative toward left field. */
  sprayDeg: number;
  /** Backspin, rpm. Negative is topspin. */
  spinRpm: number;
  /** Contact height above the plate, ft. */
  heightFt: number;
}

/**
 * Build the initial state of a batted ball.
 *
 * The spin axis is the horizontal direction PERPENDICULAR to the ball's
 * heading, which is what makes backspin LIFT rather than curve: the Magnus term
 * is `w_hat x v`, so a spin axis square to the velocity puts the force straight
 * up. Choosing the axis any other way silently converts carry into slice.
 */
export function launch(spec: LaunchSpec): BallState {
  const la = (spec.launchAngleDeg * Math.PI) / 180;
  const sa = (spec.sprayDeg * Math.PI) / 180;
  const horiz = spec.exitVelocityFts * Math.cos(la);
  const w = (spec.spinRpm * 2 * Math.PI) / 60;

  // Unit heading in the ground plane, and the perpendicular the spin rides.
  const hx = Math.sin(sa);
  const hz = Math.cos(sa);

  return {
    p: { x: 0, y: spec.heightFt, z: 0 },
    v: { x: horiz * hx, y: spec.exitVelocityFts * Math.sin(la), z: horiz * hz },
    w: { x: -hz * w, y: 0, z: hx * w },
  };
}
