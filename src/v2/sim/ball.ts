// ---------------------------------------------------------------------------
// The physical ball and the air it moves through. PURE. No integration here —
// that is flight.ts — and nothing about the field.
//
// The force model, from Nathan (Am. J. Phys. 76(2) 119-124, 2008, Eqs. 1-2;
// and the Trajectory Calculator write-up, Eqs. 7-9):
//
//     F_D = 1/2 * C_D * rho * A * v^2      opposing the velocity
//     F_M = 1/2 * C_L * rho * A * v^2      along omega_hat x v_hat
//
// Divided through by mass and gathered, both reduce to the single factor
//
//     K = 1/2 * rho * A / m                                        [1/ft]
//
// so the acceleration is
//
//     a = -K*C_D*|v|*v  +  K*C_L*|v|*(omega_hat x v)  -  g*y_hat
//
// ★ K IS THE VALIDATION, not just a convenience. It folds rho, A and m into one
// number, so deriving it from the four published constants and comparing
// against Nathan's independently-published 5.509e-3 ft^-1 exercises all three
// at once. That is a better check than terminal velocity, which the plan
// originally called for: terminal velocity is only ever as good as the C_D you
// assume, and C_D is the least certain thing here.
// ---------------------------------------------------------------------------

import { AERO, AIR, BALL } from './params';

// --- Unit bridges -----------------------------------------------------------

/** 1 kg/m^3 in slug/ft^3. Exact-ish: 1 slug = 14.5939029372 kg, 1 ft = 0.3048 m. */
const SLUG_FT3_PER_KG_M3 = (0.3048 * 0.3048 * 0.3048) / 14.5939029372;

/** 1 oz in slugs, via lb mass / g_c. */
const SLUG_PER_OZ = 1 / 16 / 32.174;

// --- Derived ball constants -------------------------------------------------

/** Ball radius, ft. From the nominal 9-1/8 in circumference. */
export const BALL_RADIUS_FT = BALL.CIRCUMFERENCE_IN / (2 * Math.PI) / 12;

/** Cross-sectional area, ft^2. */
export const BALL_AREA_FT2 = Math.PI * BALL_RADIUS_FT * BALL_RADIUS_FT;

/** Ball mass, slugs. */
export const BALL_MASS_SLUG = BALL.MASS_OZ * SLUG_PER_OZ;

/** Air density, slug/ft^3. */
export const AIR_DENSITY_SLUG_FT3 = AIR.DENSITY_KG_M3 * SLUG_FT3_PER_KG_M3;

/**
 * K = 1/2 * rho * A / m, in ft^-1. The one number the whole aerodynamic model
 * needs from the ball.
 *
 * Nathan publishes 5.509e-3 for the same nominal ball. We compute 5.493e-3, a
 * 0.30% difference, and it is HIS rounding, not ours: his Eq. 9 normalises on
 * "0.0767 lb/ft^3", while 1.225 kg/m^3 is really 0.076482 lb/ft^3. Recorded in
 * `sim.ballPhysics` rather than reconciled by adopting a rounded density to
 * make two numbers match — that would be fitting the constant to the citation.
 */
export const BALL_K_PER_FT = (0.5 * AIR_DENSITY_SLUG_FT3 * BALL_AREA_FT2) / BALL_MASS_SLUG;

/** Nathan's published value, for the test to compare against. */
export const NATHAN_K_PER_FT = 5.509e-3;

// --- Coefficients -----------------------------------------------------------

/** Radians per second -> revolutions per minute. */
const RPM_PER_RAD_S = 60 / (2 * Math.PI);

/**
 * Drag coefficient. Independent of speed; linear in spin RATE (not spin factor).
 *
 * `spinRadS` is the magnitude of the angular velocity.
 */
export function dragCoeff(spinRadS: number): number {
  const rpm = Math.abs(spinRadS) * RPM_PER_RAD_S;
  return AERO.CD_0 + AERO.CD_1 * (rpm / 1000);
}

/**
 * Spin factor S = R*omega/v — dimensionless, and the variable the lift
 * coefficient actually depends on. Zero when the ball is not moving, which is
 * the honest answer: with no relative wind there is no Magnus force.
 */
export function spinFactor(spinRadS: number, speedFts: number): number {
  if (!(speedFts > 0)) return 0;
  return (BALL_RADIUS_FT * Math.abs(spinRadS)) / speedFts;
}

/**
 * Lift (Magnus) coefficient as a function of the spin factor.
 *
 * The saturating form is a real property, not a fitting convenience: it tends
 * to CL_2/CL_1 = 0.480 as S grows without bound, so a slow, heavily-spun ball
 * cannot be given unbounded lift. That matters here more than it does for
 * Nathan — our pitch corridor is 25.6 mph, so S runs high (S = 0.34 at 50 mph
 * and 2000 rpm) compared with the MLB fly balls the fit came from.
 */
export function liftCoeff(s: number): number {
  if (!(s > 0)) return 0;
  return (AERO.CL_2 * s) / (AERO.CL_0 + AERO.CL_1 * s);
}
