// ---------------------------------------------------------------------------
// v2's tunables, in FEET and SECONDS. PURE.
//
// ★ WHY NOT `src/config.ts`
//
// That file is a 960x640 PIXEL world — `RUNNER_SPEED: 42.8` is px/s, `LIVE.
// CHASE.LEASH` is a px table, `PLATE_VIEW` is screen anchors. Putting
// `FENCE_HEIGHT_FT` next to them recreates exactly the unit confusion v2 exists
// to delete, and `defense.fielderSpeed` is what that costs: a px/s constant sat
// unchanged through five consecutive runner slowdowns because nobody could tell
// by looking whether it was still proportionate.
//
// A number in this file can be checked against a stopwatch, a tape measure, or
// a published paper. That is the whole point.
//
// NAMING: SCREAMING_SNAKE, because `conformance.test.js`'s token extractor
// harvests `/\b[A-Z][A-Z0-9_]{2,}\b/g` out of each record's `informs` and binds
// records to constants by name. A camelCase constant cannot be pointed at by a
// measurement record.
// ---------------------------------------------------------------------------

/**
 * The ball, at MLB's nominal midpoints.
 *
 * `Official Baseball Rules` 3.01 specifies 5 to 5-1/4 oz and a circumference of
 * 9 to 9-1/4 in; Little League Rulebook 1.09 adopts the same ball. Nathan's
 * published work uses the midpoints (5-1/8 oz, 9-1/8 in), and `BALL_K_PER_FT`
 * below is only comparable to his figure if we use them too.
 */
export const BALL = {
  /** oz. Rule 3.01 band 5 to 5.25. */
  MASS_OZ: 5.125,
  /** in. Rule 3.01 band 9 to 9.25. */
  CIRCUMFERENCE_IN: 9.125,
} as const;

/**
 * Air, US Standard Atmosphere 1976 at sea level.
 *
 * ★ Nathan's two papers disagree with each other by 0.4% here, and it is worth
 * knowing which one you are reproducing. The 2008 lift paper states
 * "rho is the air density (1.23 kg/m^3)"; the Trajectory Calculator writes
 * "nominally 1.225 kg/m^3 (or 0.0767 lb/ft^3)" — but 1.225 kg/m^3 is really
 * 0.076482 lb/ft^3, so his rounded 0.0767 is what makes his published K come
 * out at 5.509e-3 rather than the 5.493e-3 that 1.225 exactly gives. We use
 * 1.225 and record the gap rather than adopting a rounding to match a number.
 *
 * Altitude and temperature are a deliberate non-feature: every venue is a
 * neighbourhood at sea level, and a humidity model would be precision the rest
 * of the sim cannot use.
 */
export const AIR = {
  /** kg/m^3, sea level. */
  DENSITY_KG_M3: 1.225,
} as const;

/**
 * Drag and lift, from Nathan's Trajectory Calculator model (Eq. 10-11), fitted
 * by Levenberg-Marquardt to 2015-17 Statcast fly-ball trajectories:
 *
 *     C_D = CD_0 + CD_1 * (omega / 1000 rpm)
 *     C_L = CL_2 * S / (CL_0 + CL_1 * S),      S = R*omega/v  (spin factor)
 *
 * ★ BOTH FORMS ARE PURE ARITHMETIC, and that is load-bearing rather than
 * lucky. `+ - * /` and `Math.sqrt` are the only operations ECMAScript requires
 * to be correctly rounded; `Math.exp`, `Math.pow`, `Math.log` and the trig
 * functions are IMPLEMENTATION-APPROXIMATED and have changed across V8
 * versions. An aero model built on them yields a determinism fingerprint that
 * goes red on a Node bump and reads as somebody's bug. This one is bit-stable
 * with no interpolation tables at all — `purity.lint.test.js` keeps it that way.
 *
 * ★ WHAT THIS FIT IS NOT. It comes from MLB fly balls with exit velocity >= 90
 * mph and launch angles 20-35 degrees, indoors at Tropicana Field (Nathan
 * estimates rho = 1.194 there). Nathan verifies that C_D has no residual
 * velocity dependence "at least for speeds in the range 60-110 mph". OUR
 * BATTERS HIT 35-50 MPH. Everything below 60 mph is an extrapolation nobody
 * has validated, which is why `sim.aeroModel` carries that as an explicit
 * caveat instead of claiming the whole band.
 *
 * Spin decay (time constant ~30 s, per Nathan's Trackman note) and spin
 * precession are ignored, as he ignores them: a batted ball is airborne for
 * under 6 s.
 */
export const AERO = {
  /** Eq. 11. Dimensionless. */
  CD_0: 0.297,
  /** Eq. 11, per 1000 rpm. */
  CD_1: 0.0292,
  /** Eq. 11. Dimensionless. */
  CL_0: 0.583,
  CL_1: 2.333,
  CL_2: 1.12,
  /** The speed band Nathan's velocity-independence claim is verified over, mph. */
  FIT_SPEED_BAND_MPH: [60, 110],
  /** The spin-factor band the 2008 lift experiment covers. */
  FIT_SPIN_FACTOR_BAND: [0.09, 0.595],
} as const;

/**
 * Integration rates.
 *
 * ★ 240 Hz IS NOT AN ACCURACY CHOICE, and measuring it is what showed that.
 * `docs/OVERVIEW.md` promised "integrated RK4 at 240Hz" before any integrator
 * existed, and a number a document asserts is exactly what `render.rigHeight`
 * is about — the bone table said 4.0 ft and summed to 3.400 because nothing
 * computed the sum. So `flight.test.ts` computed this one, and the answer was
 * not the expected one: RK4 here is fourth-order (measured error ratios 16.20
 * and 16.13 per halving, against a textbook 2^4 = 16), and **accuracy is
 * saturated by 60 Hz** — a 60 Hz flight lands within 3e-9 ft of a 15360 Hz one,
 * and 240 Hz within 6e-12 ft. Nothing in this game can see 3e-9 ft.
 *
 * What 240 is actually for:
 *   1. PHASE. 240 = 4x60 = 2x120, so at both common refresh rates the
 *      accumulator remainder is exactly zero and the renderer's interpolation
 *      alpha (see `sampleAt`) is exact rather than nearly so.
 *   2. COLLISION SAMPLING. Guards are evaluated once per step, so the step size
 *      bounds how briefly a condition can hold and still be noticed — a ball
 *      passing a fielder's glove, say. Bisection makes the crossing EXACT once
 *      detected; it cannot detect one that opens and closes inside a step.
 *
 * The first draft of this comment claimed the convergence test derived the rate
 * from accuracy. It does not, and saying so would have been the design doc's
 * mistake made twice.
 *
 * STEP SIZE IS NOT THE COLLISION TOOL. A 130 ft/s liner covers 0.54 ft per
 * 240 Hz step — 2.2 ball diameters — and fixing that by raising the rate needs
 * >1000 Hz and is still only approximate. `stepFlight` BISECTS to the crossing
 * instead, which is exact to tolerance at any rate and costs nothing on the
 * ~99% of steps that contain no event.
 */
export const INTEGRATOR = {
  /** Hz. Ball flight. */
  FLIGHT_HZ: 240,
  /** Bisection tolerance on an event crossing, in seconds. */
  EVENT_TOL_SEC: 1e-7,
  /** Bisection iteration cap — a guard, not the accuracy knob. */
  EVENT_MAX_ITERS: 60,
} as const;
