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
 * Baserunning.
 *
 * ★ THE ANCHOR IS ONE EQUATION IN TWO UNKNOWNS, and pretending otherwise is how
 * a "measured" constant gets invented. `pace.homeToFirst` is the most solid
 * timing measurement this project owns — 4200ms from leaving the box to
 * touching first, n=3, spread 261ms, and the record calls it "THE anchor: every
 * other pace constant is measured against it". But a 60ft leg in 4.200s
 * constrains a (top speed, acceleration) PAIR, not either one; v1 resolved that
 * by assuming no acceleration at all and running every kid at a flat 14.29 ft/s,
 * which is too fast out of the box and too slow at the bag.
 *
 * So the second constraint comes from somewhere else: published peak sprint
 * velocity for 7-9 year olds runs about 5.0-5.8 m/s, and 18 ft/s (5.49 m/s) is
 * the middle of it. That fixes the top speed, and the ACCELERATION is then
 * SOLVED from the measured leg rather than chosen — see `sprintAccelFtS2`.
 *
 * The arithmetic is worth stating because it is exact. With a constant
 * acceleration `a` to a top speed `V` and then a cap, the time to cover `d` is
 *
 *     t = T/2 + d/V ,   where T = V/a is the time spent accelerating
 *
 * for any `d` past the acceleration distance. So T = 2*(t - d/V), and nothing
 * about it is fitted.
 */
export const RUN = {
  /**
   * Peak sprint speed, mph, mapped linearly from the `speed` stat 1..10.
   *
   * The stat-5 kid lands at 12.278 mph = 18.007 ft/s, which is what makes the
   * measured leg come out at 4197ms — the same figure `pace.homeToFirst.ours`
   * records for v1, reached from a completely different model.
   *
   * The 1.38x spread across the roster is narrower than v1's ±6%/point (1.71x).
   * Neither is measured; this one at least stays inside the published band at
   * both ends.
   */
  TOP_SPEED_MIN_MPH: 10.5,
  TOP_SPEED_MAX_MPH: 14.5,
  /** `pace.homeToFirst`, seconds. The measurement the acceleration is solved from. */
  HOME_TO_FIRST_SEC: 4.2,
  /** Which stat that measurement describes. "A BB runner", not the average one. */
  ANCHOR_SPEED_STAT: 5,
  /**
   * A runner who just touched a bag holds it this long before a policy may send
   * them again. v1's `RUN2.BASE_DWELL_MS`, and its reason survives: a leg
   * finishes and the policy runs later in the SAME tick, so without it a runner
   * relaunches with zero frames on the base.
   */
  BASE_DWELL_SEC: 0.4,
  /**
   * A reversal cannot be undone this soon. v1's `RUN2.REVERSE_COOLDOWN_MS` —
   * each direction gets a real commitment, so a rundown reads as a rundown
   * rather than a stutter.
   */
  REVERSE_COOLDOWN_SEC: 0.6,
} as const;

/**
 * The defence.
 *
 * ★ TWO OF THESE NUMBERS ARE THE POINT OF THE WHOLE FILE, and neither had a
 * measurement record in v1 at all.
 *
 * REACH. v1's `LIVE.CATCH_RADIUS` is 34px. At its own 2.994 px/ft that is
 * 11.36ft — a four-foot child catching a ball eleven feet away — with pickup at
 * 9.35ft and a dive adding 10ft more for a 21.4ft diving catch. Area scales as
 * r², so a v1 fielder covers 14.3x the ground a real kid can. Nothing in
 * `defense.*` records this, and `defense.fielderSpeed.notSufficient` spent its
 * whole argument on chase speed while every ball a fielder "reached" was a
 * putout partly because reaching was this cheap.
 *
 * THROW SPEED. `defense.throwSpeed` is `blocked` — the catcher-to-second steal
 * it planned to measure does not occur in the capture — and
 * `defense.fielderSpeed.nextLever` names it, not the chase, as the binding term
 * on a batter-to-first race. v2 cannot unblock the BB2001 reading, so it anchors
 * on a different reference class: published youth throwing velocity, ~36-42 mph
 * at 8U and 37-50 at 9U.
 */
export const DEFENSE = {
  /**
   * How far from a fielder's feet a ball can be and still be caught, ft.
   *
   * A four-foot kid's arm span is about their height, so half a span is 2ft from
   * the body centre, and a glove adds roughly another foot. Three feet is a
   * child at full stretch, which is what a catch radius is meant to mean.
   *
   * ★ IT HAS A HARD FLOOR AND THIS IS IT. `BOUNCE.BALL_SETTLE_MARGIN_FT` lets a
   * ball rest 1ft from the wall while `FIELD_MARGIN` clamps a FIELDER at 4ft, so
   * a ball against the fence sits exactly 3ft from the nearest legal standing
   * spot. `bounce.test.ts` has been asserting that gap is at most 3 since PR 3,
   * with the message "PR 5 catch radius must cover this". Three feet covers it
   * with nothing to spare — which is why the relationship is pinned from both
   * ends rather than left to be noticed later.
   */
  REACH_FT: 3,
  /**
   * The height the reach sphere is centred on, ft — a kid's chest.
   *
   * ★ v1 HAS NO SUCH THING, and that absence is a whole fudge. Its fly-ball test
   * is `dist(chaser.pos, b.pos) <= catchRadius` in the FLAT plane, so a fielder
   * standing under a ball forty feet up is "within 34px" of it. What stops that
   * catch is `CATCHABLE_TAIL` — a rule that only the last 40% of a flight can be
   * caught — which is a timing constant standing in for a geometry fact. With a
   * centre and a radius the rule falls out: reach tops out at 6ft, so a ball
   * above that is not catchable, whenever in the flight it happens to be.
   */
  CATCH_CENTRE_FT: 3,
  /**
   * The kid the reach is derived from, ft. Mirrors `render/skeleton.ts`'s
   * `REFERENCE_HEIGHT_FT`, which the sim may not import (that is the whole job
   * of the purity gate). `sim-contract.test.js` reads both and fails if they
   * drift — the one place allowed to look at each.
   */
  REFERENCE_HEIGHT_FT: 4,
  /**
   * A DIVE adds this much reach, ft. v1 adds 30px = 10ft, taking a diving catch
   * out to 21.4ft. A real dive extends a kid by roughly their own torso.
   */
  DIVE_REACH_FT: 1.6,
  /** How long the lunge lasts, seconds. v1's `LIVE.DIVE.WINDOW_MS`. */
  DIVE_WINDOW_SEC: 0.34,
  /** Face-down-in-the-grass after an empty dive, seconds. */
  DIVE_WHIFF_SEC: 0.8,
  /**
   * Throwing velocity, mph, from the `pitching` stat 1..10.
   *
   * Published youth bands: 36-42 mph at 8U, 37-50 at 9U. Against the anchored
   * 18 ft/s runner this is 2.4x-4.9x runner speed, where v1 CLASSIC throws at
   * 9.65x and v1 KID — the mode that actually produces base hits — at 4.60x.
   * That KID sits inside the published band and CLASSIC sits at twice its top is
   * the strongest thing anyone has been able to say about `defense.throwSpeed`
   * since it was blocked.
   */
  THROW_SPEED_MIN_MPH: 30,
  THROW_SPEED_MAX_MPH: 48,
  /**
   * Gather-and-release once the ball is secured, seconds.
   *
   * v1 spends `cpuThrowDelayMs` 1192ms here on top of `cpuReactionMs` 835ms —
   * 2027ms of a fielder standing perfectly still, 48% of the batter's entire
   * 4200ms leg. This is a kid catching a ball, finding the bag and letting go.
   */
  RELEASE_SEC: 0.45,
  /**
   * Read-and-go, seconds, from the `fielding` stat.
   *
   * Published simple visual reaction time in 8-10 year olds is roughly 280-350ms;
   * a fielder must also decide where the ball is going, so the band starts above
   * it. Compare v1's 835ms (main) / 1093ms (kid), which `defense.cpuReaction`
   * holds at `awaiting-measurement` with an explicit warning that its 1050ms
   * partial reading "cannot separate a DECISION DELAY from an ACCELERATION
   * RAMP". v2 models the ramp, so the two are no longer confounded here.
   */
  REACTION_MIN_SEC: 0.3,
  REACTION_MAX_SEC: 0.5,
  /** Chance of dropping a routine fly at glove 5, before the stat adjustment. */
  DROP_BASE: 0.14,
  /** How much each point of `fielding` buys. v1's `ERRORS.PER_GLOVE`. */
  DROP_PER_GLOVE: 0.02,
  /** A grounder is easier to handle than a fly. v1's `ERRORS.BOBBLE_FACTOR`. */
  BOBBLE_FACTOR: 0.5,
  /** A muffed ball freezes the kid this long, seconds. */
  FUMBLE_SEC: 0.65,
  /**
   * Chaser election: how far ahead the ball's path is sampled, seconds, and how
   * many samples. v1's `LIVE.CHASE.HORIZON_MS` / `SAMPLES`.
   */
  CHASE_HORIZON_SEC: 8,
  CHASE_SAMPLES: 24,
  /**
   * How finely the play reducer samples the ball's path, seconds.
   *
   * ★ THE ELECTION AIMS AT A SAMPLE, so the grid is the resolution of the aim
   * point — and `cutOff` returns the FIRST sample a fielder can beat the ball
   * to, which a coarse grid pushes late. `CHASE_SAMPLES` 24 over an 8s horizon
   * is one point every third of a second, or seven feet of a rolling ball: a
   * shortstop was told to meet a grounder seven feet deeper than he needed to,
   * every time, which is seven feet added to the throw AND to the play.
   */
  CHASE_STEP_SEC: 0.05,
  /**
   * The cut-ahead gate: how much sooner a challenger must reach the ball before
   * it is taken off the fielder whose zone it settles in.
   *
   * ★ A RATIO RATHER THAN A DURATION — AND MEASURING THAT DECISION CORRECTED THE
   * REASON FOR IT. v1's `LIVE.CHASE.CUT_AHEAD_MS` is a fixed 400ms compared
   * against BALL-PATH times, and `defense.chaserElection` measured the zone
   * owner being overridden 27.7% of the time at 106px/s against 32.4% at
   * 42.8px/s, concluding the constant "cannot be speed-neutral by construction".
   * The obvious inference — express it as a fraction and the drift goes away —
   * is WRONG, and this file's first draft asserted it.
   *
   * Measured over 215 launches at three uniform defence speeds (0.5x, 1x, 2x),
   * running the two gate forms on identical inputs: the ratio drifts 7.4pp and a
   * fixed 0.40s gate drifts 7.4pp. They are the same. The override rate moves
   * because a speed change alters WHICH FIELDERS CAN INTERCEPT AT ALL, which no
   * gate form touches.
   *
   * So this stays a ratio for a smaller and honest reason: it is dimensionless,
   * so it cannot silently become a different rule when the times it compares
   * change scale, and there is no unit for a future retune to leave stale. It is
   * a correctness-of-form change, not a measured improvement, and
   * `sim.chaserElectionGate` records the measurement rather than the hope.
   */
  CUT_AHEAD_FRAC: 0.15,
  /**
   * Leash: how near a fielder's POST the ball must settle for them to be a
   * candidate at all, ft. v1's `LIVE.CHASE.LEASH` converted directly — the
   * infield geometry is the one part of v1's field that was already real (a 60ft
   * basepath), so 90/170/250px are 30/57/84ft with no reinterpretation.
   *
   * Without it, ranking a grounder on "who gets there first" hands nearly every
   * one to the pitcher, who starts closest to the ball's early path at every
   * spray angle.
   */
  LEASH_FT: { P: 30, C: 30, '1B': 57, '3B': 57, '2B': 84, SS: 84, LF: 1e4, CF: 1e4, RF: 1e4 },
  /** A chaser already this close to the ball keeps it. v1's `KEEP_RADIUS`. */
  KEEP_RADIUS_FT: 20,
  /** Handovers cannot come faster than this, seconds. A human-perception beat. */
  SWITCH_COOLDOWN_SEC: 0.5,
  /** A challenger must beat the incumbent by this fraction. Same form and same
   *  reasoning as `CUT_AHEAD_FRAC`, including its limits. */
  SWITCH_MARGIN_FRAC: 0.12,
  /** Slack on a cut-off: a fielder arriving this much late still cuts it off. */
  CUTOFF_GRACE_SEC: 0.12,
} as const;

/**
 * The play itself — the handful of numbers that are about a PLAY rather than
 * about a ball, a kid or an arm.
 *
 * ★ TWO OF v1's ARE DELIBERATELY ABSENT, and their absence is the finding.
 *
 * `RUN2.TAG_RADIUS` is 26px = **8.7 ft** at v1's own scale: a fielder tagging a
 * runner from nine feet away. There is no tag radius here because a tag is a
 * glove touching a runner, which is `reachFt()` — the same three feet the catch
 * uses, from the same arm. One quantity, one place, exactly as `athletes.ts`
 * exists to enforce.
 *
 * `RUN2.SAFE_RADIUS` (14px, "a runner within this of a bag counts as standing
 * ON it") does not exist either, and this one is not even a re-derivation: v2's
 * runners are LEG-parameterised, so `isSettled(r)` — `to === from` — *is*
 * standing on the bag. v1 needs a radius because its runners are positions on a
 * field and it has to ask geometry a question the state already answers.
 */
export const PLAY = {
  /**
   * Hard cap on a play, seconds.
   *
   * v1's `LIVE.MAX_PLAY_MS` is 21862 and its comment says "NOT measured --
   * scaled with RUNNER_SPEED". Ours is a real bound: the longest legitimate
   * sequence is a ball to the deepest fence (~212ft), a chase, a relay in, and
   * a runner going first to home (180ft from a standing start, ~11s at the
   * slowest stat). Twenty seconds clears that with room, and — the part v1
   * never had — `play.test.ts` asserts NO LEGITIMATE PLAY EVER REACHES IT.
   * A cap that fires is a soft-lock that was caught, not a rule.
   */
  MAX_PLAY_SEC: 20,
  /**
   * The infinite-relay guard. v1's `LIVE.RELAY.MAX_LEGS`: outfielder -> cutoff
   * -> pitcher, then stop.
   */
  RELAY_MAX_LEGS: 2,
  /**
   * How much a throw must beat a runner by to be worth making, seconds.
   *
   * v1's `bestBeatableBase` uses a bare `throwMs < runnerMs` and then vetoes the
   * throw entirely when nothing is beatable. The margin is here because the
   * runner's remaining time is computed from their CURRENT speed and a fielder
   * cannot know it exactly; throwing on a coin-flip is how a defence gives away
   * bases on overthrows it did not need to attempt.
   */
  THROW_MARGIN_SEC: 0.1,
  /**
   * ★ THERE IS NO GREED DISTANCE, AND THAT IS THE POINT.
   *
   * v1 sends a CPU runner when the ball is more than `CPU_RUNNER_GREED_DIST`
   * (180px = 60.1ft, one basepath) from the next bag — a DISTANCE standing in
   * for a RACE. A distance cannot see that the kid holding the ball is 190ft
   * away with an arm that reaches 97, so a ball in the gap reads the same as a
   * ball in the shortstop's glove once both are "far from second".
   *
   * `play.ts`'s `worthTaking` asks the question instead, through the same
   * `throwFlightSec` the defence uses to decide whether to throw at all — so the
   * two sides of the race are measured the same way. It is what makes a gap ball
   * a DOUBLE rather than a single: the outfielder has the ball and still cannot
   * do anything with it.
   */
  /**
   * Nobody has picked the ball up in this long? Everyone goes. v1's
   * `LIVE.CPU_RUNNER_PATIENCE_MS` (2981ms), which was itself scaled rather than
   * measured; kept at three seconds because it reads as "kids notice".
   */
  RUNNER_PATIENCE_SEC: 3,
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
