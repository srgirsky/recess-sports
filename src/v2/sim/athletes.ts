// ---------------------------------------------------------------------------
// Where a 1-10 STAT becomes a real physical quantity. PURE.
//
// ★ WHY THIS FILE EXISTS AT ALL, and it is not tidiness.
//
// `defense.fielderSpeed` records v1's most expensive tuning bug: `FIELDER_SPEED`
// sat at 210 px/s through FIVE consecutive runner slowdowns, drifting from 1.20x
// to 2.47x runner speed, and the 2026-07-24 retune then scaled BOTH by 1/1.987 —
// faithfully preserving the wrong ratio. Its conclusion was that fielders and
// baserunners are the same kids, so the honest ratio is 1.0: "a kid does not get
// faster by putting a glove on."
//
// In v1 that is an invariant a test asserts. Here it becomes structurally
// impossible to violate, because there is exactly ONE function per physical
// quantity and every consumer calls it.
//
// ★ AND THE PARITY IS NOT A COMMENT. `purity.lint.test.js` reads every other
// file in `src/v2/sim/**` and fails any that names a kid speed of its own, then
// asserts `sprintSpeedFts` is literally the function a fielder and a runner both
// call. v1's version of this rule was a sentence in a config file, and the
// sentence was true for five consecutive retunes while the ratio drifted to
// 2.48x underneath it.
// ---------------------------------------------------------------------------

import { BAT, DEFENSE, RUN } from './params';
import { BASEPATH } from './field';
import { mphToFts } from './units';

/** Clamp a 1-10 stat, so a content typo cannot produce a negative bat. */
function stat01(stat: number): number {
  const s = stat < 1 ? 1 : stat > 10 ? 10 : stat;
  return (s - 1) / 9;
}

/**
 * Bat speed at the sweet spot, ft/s, from the `power` stat.
 *
 * ★ THE STAT'S OWN DOC COMMENT IS NOW STALE. `data/types.ts` glosses `power` as
 * "turns hits into extra bases (doubles, homers)" — a description of an OUTCOME,
 * written when outcomes were rolled. It is an input now: power sets how fast the
 * kid swings, and whether that becomes a double, a homer or a long out is
 * decided by the ball's flight and the defence.
 *
 * Linear in the stat because nothing justifies a curve. The roster spans power
 * 2-10 (nobody has 1), so the realised band is 37-53 mph.
 */
export function batSpeedFts(powerStat: number): number {
  const mph = BAT.SPEED_MIN_MPH + (BAT.SPEED_MAX_MPH - BAT.SPEED_MIN_MPH) * stat01(powerStat);
  return mphToFts(mph);
}

// --- Running ----------------------------------------------------------------

/**
 * Peak sprint speed, ft/s, from the `speed` stat.
 *
 * ★ THE ONE SPEED FUNCTION. A fielder chasing a ball and a runner chasing a bag
 * are the same child; both call this. `defense.fielderSpeed` is the record of
 * what happens when they do not — v1's fielders ended up 2.48x faster than its
 * runners, one retune at a time, because each had a constant of its own.
 */
export function sprintTopSpeedFts(speedStat: number): number {
  const mph = RUN.TOP_SPEED_MIN_MPH + (RUN.TOP_SPEED_MAX_MPH - RUN.TOP_SPEED_MIN_MPH) * stat01(speedStat);
  return mphToFts(mph);
}

/**
 * ★ HOW LONG A KID SPENDS GETTING UP TO SPEED — SOLVED FROM THE MEASUREMENT,
 * NOT PICKED.
 *
 * For constant acceleration to a capped top speed, covering `d` takes
 * `T/2 + d/V` where `T = V/a`. `pace.homeToFirst` measures that time (4.200s)
 * over `d = BASEPATH`, and `RUN.TOP_SPEED_*` fixes `V` from published child
 * peak velocity, so
 *
 *     T = 2 * (HOME_TO_FIRST_SEC - BASEPATH / V)
 *
 * has no freedom left in it. It comes out at 1.736s, an acceleration of
 * 10.37 ft/s², and the kid hits top speed 15.6ft down the line.
 *
 * Every kid takes the SAME time to get going; a faster kid simply ends up
 * faster. That is one assumption and it is stated rather than buried, because
 * the alternative — solving each stat against the same 4.200s — would make
 * every kid on the roster run the leg in exactly 4.2s and delete the stat.
 */
const ACCEL_SEC = 2 * (RUN.HOME_TO_FIRST_SEC - BASEPATH / sprintTopSpeedFts(RUN.ANCHOR_SPEED_STAT));

/** Sprint acceleration, ft/s², from the `speed` stat. */
export function sprintAccelFtS2(speedStat: number): number {
  return sprintTopSpeedFts(speedStat) / ACCEL_SEC;
}

/** How long the acceleration phase lasts, seconds. Exposed so a test can check
 *  the derivation above against the measurement rather than against itself. */
export function sprintAccelSec(): number {
  return ACCEL_SEC;
}

/**
 * Closed form: how long a kid takes to cover `distFt` from a standing start.
 *
 * This is the ORACLE, not the mover — `runners.ts` integrates, and a test
 * asserts the integrator agrees with this to within a tick. An integrator
 * checked only against itself is checked against nothing.
 */
export function sprintTimeSec(distFt: number, speedStat: number): number {
  return sprintTimeForFt(distFt, sprintTopSpeedFts(speedStat), sprintAccelFtS2(speedStat));
}

/**
 * The same closed form, against legs a caller already holds.
 *
 * ★ THE CHASER ELECTION HAS TO USE THIS ONE, and the reason is not performance.
 * Ranking fielders by `sprintTimeSec(ft, f.speed)` re-derives the legs from the
 * STAT and ignores whatever the fielder actually carries — so a test that scales
 * a defence to prove the cut-ahead gate is speed-neutral scales nothing the
 * election reads, and passes while proving nothing. Found by breaking the gate
 * and watching it stay green.
 *
 * ★ AND `fromFts` IS NOT A CONVENIENCE. The election re-runs while the chase is
 * already under way, and charging a fielder a fresh standing-start ramp every
 * time says he is up to 0.87s slower than he is. The symptom was a shortstop who
 * would not CHARGE: told he could not reach the ball out in front, he settled
 * for meeting it where it happened to arrive — fourteen feet deeper, which is
 * fourteen feet added to the throw and half a second added to the play. He was
 * being asked what a kid standing still could do, over and over, while running.
 */
export function sprintTimeForFt(
  distFt: number,
  topFts: number,
  accelFtS2: number,
  fromFts = 0
): number {
  if (distFt <= 0) return 0;
  const v0 = fromFts < 0 ? 0 : fromFts > topFts ? topFts : fromFts;
  // Distance still needed to reach top speed from v0, and the time it takes.
  const rampFt = (topFts * topFts - v0 * v0) / (2 * accelFtS2);
  if (distFt <= rampFt) {
    return (Math.sqrt(v0 * v0 + 2 * accelFtS2 * distFt) - v0) / accelFtS2;
  }
  return (topFts - v0) / accelFtS2 + (distFt - rampFt) / topFts;
}

// --- Fielding ---------------------------------------------------------------

/**
 * How far a fielder can reach, ft. Constant, and deliberately not per-kid.
 *
 * The roster's `body.height` is a RENDER scale — `VisualParams` describes a
 * drawing — and `render.characterScale` is explicit that render exaggeration
 * "must never leak into `src/v2/sim/**`: catch radii, reach, stride and
 * collision stay real feet". A sim reach that varied with a drawing scale would
 * be exactly that leak, and it would also put the shortest kid under the 3ft
 * floor `DEFENSE.REACH_FT` documents.
 */
export function reachFt(): number {
  return DEFENSE.REACH_FT;
}

/**
 * Throwing velocity, ft/s, from the `pitching` stat.
 *
 * ★ ANCHORED ON SPEED, NOT ON FLIGHT TIME, and that is a deliberate split from
 * `pitch.ts`. The pitch is solved to a measured FLIGHT TIME because that is what
 * `pace.pitchCorridor` measured; a throw to a base has no such measurement and
 * an entirely different constraint (get it there), so it is anchored directly on
 * the published throwing-velocity band. The two agree where they can be
 * compared: `releasePitch` at stat 5 leaves the hand at 33.5 mph, and this
 * returns 38 mph for a max-effort throw by the same arm.
 */
export function throwSpeedFts(pitchingStat: number): number {
  const mph =
    DEFENSE.THROW_SPEED_MIN_MPH +
    (DEFENSE.THROW_SPEED_MAX_MPH - DEFENSE.THROW_SPEED_MIN_MPH) * stat01(pitchingStat);
  return mphToFts(mph);
}

/**
 * Read-and-go, seconds, from the `fielding` stat. DECREASING: a better fielder
 * reads it sooner. (`armMult` shipped inverted for want of this sentence.)
 */
export function reactionSec(fieldingStat: number): number {
  return (
    DEFENSE.REACTION_MAX_SEC -
    (DEFENSE.REACTION_MAX_SEC - DEFENSE.REACTION_MIN_SEC) * stat01(fieldingStat)
  );
}
