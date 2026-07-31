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
 * What happens when the ball meets something solid.
 *
 * ★ THE MODEL FORM IS DERIVED; THE COEFFICIENTS ARE CITED OR PENDING. Same
 * split as `AERO` above, and for the same reason: rigid-body impact mechanics
 * is a thing you can derive on paper and check, while "how bouncy is shaggy
 * backyard grass" is an empirical number nobody in this repo has measured.
 * `sim.bounceModel` conforms the form; `sim.groundBounce`, `sim.rollFriction`
 * and `sim.wallRestitution` stay `awaiting-measurement` and say what would
 * close them.
 *
 * `COR_BASE` is the BASE ground restitution; each venue's `bounceMult` in
 * `field.ts` scales it. Keeping those two in separate files is deliberate —
 * v1 let one multiplier serve as both a hop multiplier and a wall multiplier
 * (`WALL_REST * bounceMult`), and the doc comment describing it stopped being
 * true. Here `bounceMult` means exactly what `field.ts` says it means: applied
 * to the ground restitution, and to nothing else.
 *
 * Published band: Brosnan & McNitt's "Pennbounce" work at Penn State's Center
 * for Sports Surface Research measured baseball COR across skinned infield,
 * natural turfgrass and two synthetic turfs at **0.4-0.6**, ordered
 * skinned >= synthetic > natural grass, and found COR tracks surface HARDNESS
 * (soil properties matter more than cutting height or thatch). At
 * `COR_BASE 0.50` the authored multipliers put the park's mown grass at 0.50
 * and the sandlot's shaggy grass at 0.40 — both inside that band — while the
 * blacktop lands at 0.65, deliberately OUTSIDE it, because asphalt is not a
 * turf surface and the band is for infields. A test asserts all three.
 */
export const BOUNCE = {
  /** Base ground coefficient of restitution, before the venue multiplier. */
  COR_BASE: 0.5,
  /**
   * Coulomb friction coefficient between ball and ground, governing whether an
   * impact GRIPS (the contact point stops) or SLIPS through. Not measured;
   * chosen high enough that a normal grounder grips, which is what makes
   * backspin behave.
   */
  MU_GROUND: 0.5,
  /** Tangential speed retained in a wall carom, on top of `wallRestitution`. */
  WALL_TANGENTIAL_KEEP: 0.8,
  /**
   * Below this rebound speed the ball stops bouncing and starts rolling.
   * Needed because restitution is geometric: without a floor a ball takes
   * infinitely many ever-smaller hops and the sim never advances (Zeno). v1
   * hit the same wall and papered over it with a 0.15 speed floor and a 3px
   * snap-to-settle.
   */
  REST_BOUNCE_FTS: 1.5,
  /** Below this ground speed a rolling ball is at rest. */
  REST_ROLL_FTS: 0.5,
  /**
   * How close to the fence a RESTING ball may sit, in ft.
   *
   * ★ Must stay well inside `FIELD_MARGIN` (4ft, where a FIELDER is clamped),
   * or the ball comes to rest somewhere nobody can legally stand and the play
   * runs to its length cap with a kid pressed against the wall. v1 shipped
   * exactly that bug via an unclamped wild-throw overshoot. The gap here is
   * 4 - 1 = 3ft, which PR 5's catch radius must cover; a test pins the
   * relationship so it cannot silently invert.
   */
  BALL_SETTLE_MARGIN_FT: 1,
} as const;

/**
 * The bat, and what happens when it meets the ball.
 *
 * ★ THE EXIT-VELOCITY IDENTITY IS NOT A FIT. Nathan ("Characterizing the
 * performance of baseball bats", Am. J. Phys. 71(2) 134-143, 2003) derives
 *
 *     Eq. 3   v_f = e_A * v_ball + (1 + e_A) * v_bat
 *
 * "from nothing other than the definition of e_A followed by a change of
 * inertial reference frame" — it is exact for any ball, bat or collision model.
 * The only thing that needs a value is the collision efficiency e_A, and that
 * is itself derived rather than assumed:
 *
 *     Eq. 6   e_A = (e - r) / (1 + r),      r = m / M_eff   (bat recoil factor)
 *
 * with e the ball-bat coefficient of restitution, measured at 0.45-0.50 in the
 * sweet-spot zone at game speeds.
 *
 * ★ EQ. 6 IS WHY A KID IS NOT A SMALL ADULT. A light bat has a LARGE recoil
 * factor, so more of the collision goes into moving the bat and less into the
 * ball. At an adult's effective mass (~20oz at the sweet spot) e_A is about
 * 0.20; at a youth bat's ~14oz it is 0.098. Halving e_A costs a kid far less
 * than you would guess — the `(1 + e_A)` term on bat speed dominates — which is
 * exactly why bat speed, not bat "power", is the stat that matters.
 */
export const BAT = {
  /** Ball-bat COR in the sweet-spot zone. Nathan: 0.45-0.50 at game speeds. */
  BALL_BAT_COR: 0.5,
  /**
   * Effective bat mass at the sweet spot, oz. A youth bat, not an adult's.
   * `e_A` is DERIVED from this via Eq. 6 rather than stated, so the two can
   * never disagree — see `collisionEfficiency` in `contact.ts`.
   */
  EFFECTIVE_MASS_OZ: 14,
  /** Barrel radius, ft. A 2.5in youth barrel. Sets the contact geometry. */
  BARREL_RADIUS_FT: 0.104,
  /**
   * Bat speed at the sweet spot, mph, mapped linearly from the `power` stat
   * 1..10.
   *
   * ★ BOXED IN, NOT CHOSEN. Published Little League bat speed runs 40-60 mph
   * with roughly +2.5 mph per year of age from 9U, so 35-53 is that band
   * carried down to four-to-eight-year-olds. The top end is then pinned from
   * the other side by `sim.carryVsFence`: it has to clear the park's 185ft
   * line and NOT its 212ft centre. Both constraints land on the same number.
   *
   * Independent corroboration: at e_A 0.098 and no pitch (a tee), bat 40-50
   * gives exit velocity 44-55 mph, against a published 8U tee band of 45-55.
   */
  SPEED_MIN_MPH: 35,
  SPEED_MAX_MPH: 53,
  /**
   * How far off the sweet spot the barrel can meet the ball before e_A has
   * fallen to nothing, ft. Nathan: e_A "is expected to be a strong function of
   * the impact location along the axis of the bat", largest in a zone roughly
   * 4-6in from the barrel end.
   */
  SWEET_SPOT_SPAN_FT: 0.5,
  /**
   * ★ THE GRIP ENHANCEMENT — SET TO 1.0, AND THAT IS THE HONEST NUMBER.
   *
   * Kensrud, Nathan & Smith ("Oblique Collisions of Baseballs and Softballs
   * with a Bat", arXiv:1610.03464) found the ball GRIPS the bat rather than
   * rolling off it, "resulting in a spin that was up to 40% greater than would
   * be obtained by rolling contact of rigid bodies" — the same finding as
   * `sim.bounceModel`'s, and the obvious thing to do is apply the 1.4.
   *
   * Applying it DOUBLE-COUNTS. Working their own numbers back: they measured
   * spins of 0-3500 rpm over scattering angles 0-30 deg at bat speeds 63-88
   * mph, and the rigid-body ROLLING prediction at 30 deg and 88 mph is already
   * ~3600 rpm. Their measured ceiling sits at the rolling limit, not 40% above
   * it, so the 40% must be normalised against something the abstract does not
   * state — a different reference model, or a subset of angles. Multiplying our
   * rolling result by 1.4 put a kid's batted ball at 4600-5400 rpm, comfortably
   * outside the band the paper measured.
   *
   * So: use the DERIVED rolling limit, which lands inside their measured band,
   * and record the enhancement as pending rather than guessing at a
   * normalisation. `sim.obliqueContact` carries what would close it.
   */
  GRIP_SPIN_ENHANCEMENT: 1,
  /**
   * The swing window, as a FRACTION of the pitch's flight time.
   *
   * ★ A FRACTION ON PURPOSE. `pace.swingWindows` records the invariant that
   * "CONTACT must stay below the FASTEST possible travelMs in every mode, or
   * timing stops being a skill" — and v1 can only satisfy that by assertion,
   * because `bandFromError` compares `Math.abs(errorMs)` against absolute-ms
   * constants and never looks at `travelMs`. That is precisely how a 380ms
   * window ended up wider than a 270ms flight. Expressed as a fraction it
   * holds by construction and there is nothing left to assert.
   *
   * Same record: a window is DERIVED, never measured — it is an internal
   * tolerance with no on-screen representation, so no footage can reveal one.
   */
  CONTACT_WINDOW_FRAC: 0.24,
  /** Inside this fraction of the flight, contact is square. */
  PERFECT_WINDOW_FRAC: 0.065,
  /**
   * Spray from timing, degrees of pull per foot of contact depth.
   *
   * DERIVED. v1's equivalent was a bare `spec.errorMs / 300` literal inside
   * `resolveContactAimed` — the one number in that file coupled to timing-error
   * magnitude, and it did NOT move when the pitch corridor was re-measured from
   * 297ms to 1350ms. Named here so it cannot go stale invisibly.
   */
  PULL_DEG_PER_FT: 26,
} as const;

/**
 * The pitch.
 *
 * ★ ANCHORED ON ONE MEASUREMENT, AND IT IS n=1. `pace.pitchCorridor` brackets a
 * single BB2001 HEAT pitch against a millisecond stopwatch captured in the same
 * frame: release 12:58.87, plate 13:00.10 — a flight of 1230ms over the 46ft
 * mound. That is 37.4 ft/s, or 25.5 mph: a real seven-year-old's fastball, which
 * is the happy check that the whole real-units decision rests on.
 *
 * The record is `awaiting-measurement`, not `conformed`, and says why: "n=1 at
 * this rigour. The repo convention is n<3 stays a partialReading, and the entire
 * point of this record is that overclaiming is how the 270ms happened." Every
 * earlier reading — BB's own 270ms, a YouTube 250ms, two of our own at 180-200 —
 * made the same mistake, marking release at the first frame the ~5px ball could
 * be SPOTTED against the grass, which is late by construction.
 */
export const PITCH = {
  /**
   * ★ THE MEASURED QUANTITY IS THE FLIGHT TIME, NOT A SPEED — and conflating
   * them is a mistake this file made first.
   *
   * The record brackets 1230ms over the 46ft mound and `docs/OVERVIEW.md`
   * summarises that as "25.6 mph, exactly a seven-year-old's fastball". That
   * figure is 46ft / 1.23s: the ball's average pace toward the plate. It is NOT
   * the release speed, and using it as one puts the pitch 26 FEET UNDERGROUND
   * at the plate — because a 46ft flight lasting 1.23s falls 24ft under gravity
   * on the way, so the ball has to be thrown UPWARD to arrive hittable.
   *
   * So the flight time is the anchor and the release velocity is SOLVED from
   * it: `releasePitch` finds the (speed, elevation) that both crosses the plate
   * at the aim height and takes this long doing it. Two constraints, two
   * unknowns. That makes the one measurement this project actually owns the
   * thing the pitch is built on, rather than a number reinterpreted to fit.
   */
  FLIGHT_TIME_SEC: 1.23,
  /** Release point height, ft. A kid's overhand release. */
  RELEASE_HEIGHT_FT: 4.2,
  /**
   * Arm spread. DELIBERATELY NOT A CURVE: `pace.pitchCorridor.armRatingCaveat`
   * records that BB's on-screen "PT" is a pitches-thrown counter rather than a
   * rating, so flight time cannot be bound to a pitcher stat from that footage —
   * "ARM_MULT remains uncalibrated". This is a spread around the one measured
   * flight, and it is honest about being one.
   */
  ARM_MULT_MIN: 0.86,
  ARM_MULT_MAX: 1.18,
  /**
   * Secant steps used to solve the release elevation that actually delivers the
   * ball to the aim point. Three is enough: the crossing miss is near-linear in
   * elevation over this range. See `releasePitch` for why a solve is needed at
   * all (aiming straight at the target arrives 26ft underground).
   */
  AIM_ITERATIONS: 6,
  /** Close enough on flight time, seconds. */
  AIM_TOL_SEC: 0.005,
  /** Bisection steps for the elevation solve. */
  ELEV_ITERATIONS: 26,
  /** Coarse scan points used to find the reachable peak before bisecting. */
  ELEV_SCAN: 12,
  /** A pitch that has not reached the plate by now is not going to. */
  MAX_FLIGHT_SEC: 5,
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
