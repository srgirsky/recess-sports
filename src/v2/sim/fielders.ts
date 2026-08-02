// ---------------------------------------------------------------------------
// Nine kids, a glove each. PURE.
//
// ★ WHAT THIS FILE IS ANSWERING. `defense.fielderSpeed` is the record of v1's
// most expensive tuning bug and it ends with a warning rather than a fix:
// "THIS DOES NOT MAKE BASE HITS POSSIBLE, and saying so here is the point of the
// record." Against a 4197ms leg to first, a ball into the true LF-CF gap was
// still an out by 897ms. Three things were wrong at once and only one of them
// was speed:
//
//   1. THE FIELD. Centre field sat 1.49 basepaths from home where real baseball
//      is ~3.3, so an outfielder's throw was SHORTER than a shortstop's and
//      there was no gap to hit a ball into. `field.ts` already fixed this —
//      2.42-2.75 basepaths — and says so in its own header.
//   2. THE REACH. `LIVE.CATCH_RADIUS` is 34px = 11.36ft, so a fielder covered
//      14.3x the area a four-foot child can. There was no record for it at all.
//   3. THE THROW. v1 CLASSIC throws at 9.65x runner speed. Published youth arms
//      manage 2.4x-4.9x. `defense.throwSpeed` is blocked on footage that does
//      not contain the play it needs, so v2 anchors on the published band.
//
// ★ AND ONE THING v1 GOT RIGHT THAT IS PORTED WHOLESALE: the chaser election.
// `systems/fielding.ts` exists because "nearest to the landing spot, decided at
// contact" measures, for a grounder, distance to where the ball STOPS ROLLING —
// so a hard grounder up the right side elected the right fielder while it rolled
// through the second baseman's feet a second and a half earlier. The two regimes
// and both gates are carried over. One thing is corrected on the way: v1's
// cut-ahead gate is a fixed 400ms compared against ball-path times that scale as
// 1/speed, and `defense.chaserElection` measured it drifting from a 27.7%
// override rate to 32.4% when the speeds were retuned. Here it is a ratio.
//
// ★ ON TRIG: there is none, and that is deliberate rather than lucky. Pursuit is
// `moveToward` (hypot and a division) and the throw arc is solved in closed form
// through a half-angle identity that needs only `sqrt` — see `throwFlightSec`.
// So this file joins `flight.ts` and `ball.ts` on the purity lint's HOT list: it
// runs per tick for nine kids, which is a per-step force term by any other name.
// ---------------------------------------------------------------------------

import type { Character } from '../../data/types';
import { DEFENSE } from './params';
import { G } from './units';
import {
  clampToField,
  dist,
  moveToward,
  FIELD_POSITIONS,
  type FieldGeometry,
  type PositionId,
  type Vec2,
  type Vec3,
} from './field';
import {
  reachFt,
  reactionSec,
  sprintAccelFtS2,
  sprintTimeForFt,
  sprintTopSpeedFts,
  throwSpeedFts,
} from './athletes';
import type { LooseTrace, PathSample } from './bounce';
import type { Rng } from './rng';

/**
 * One fielder.
 *
 * `speed`, `glove` and `arm` are the 1-10 stats, kept rather than pre-resolved
 * so every physical quantity still comes out of `athletes.ts` at the point of
 * use. `topFts` and `accelFtS2` are cached from the same functions because the
 * pursuit step runs every tick.
 */
export interface FielderState {
  charId: string;
  position: PositionId;
  /** The post they start from, and the zone the leash measures against. */
  home: Vec2;
  p: Vec2;
  /** Current ground speed, ft/s. A fielder starts from a standing start too. */
  speedFts: number;
  topFts: number;
  accelFtS2: number;
  speed: number;
  glove: number;
  arm: number;
  /** Sim seconds before which this kid has not read the ball yet. */
  readyAtSec: number;
  /** Frozen until, after a muff or an empty dive. */
  fumbleUntilSec: number;
  /** Sim seconds the dive's reach bonus expires, or null. */
  diveUntilSec: number | null;
  hasBall: boolean;
}

export function makeFielder(
  char: Character,
  position: PositionId,
  opts: { nowSec?: number; at?: Vec2; firstStepFrac?: number } = {}
): FielderState {
  const home = FIELD_POSITIONS[position];
  const now = opts.nowSec ?? 0;
  return {
    charId: char.id,
    position,
    home: { ...home },
    p: { ...(opts.at ?? home) },
    // ★ NOT ZERO. A fielder is not standing flat-footed when the ball is struck;
    // he is in a ready crouch having taken a split-step with the pitch. See
    // `DEFENSE.FIRST_STEP_FTS` for why this is a STATE and not a faster ramp.
    speedFts: sprintTopSpeedFts(char.stats.speed) * (opts.firstStepFrac ?? DEFENSE.FIRST_STEP_FRAC),
    topFts: sprintTopSpeedFts(char.stats.speed),
    accelFtS2: sprintAccelFtS2(char.stats.speed),
    speed: char.stats.speed,
    glove: char.stats.fielding,
    arm: char.stats.pitching,
    readyAtSec: now + reactionSec(char.stats.fielding),
    fumbleUntilSec: -1,
    diveUntilSec: null,
    hasBall: false,
  };
}

/** True while this kid cannot do anything at all. */
export function isFrozen(f: FielderState, nowSec: number): boolean {
  return nowSec < f.readyAtSec || nowSec < f.fumbleUntilSec;
}

/**
 * Move one fielder toward a point for `dtSec`.
 *
 * ★ ACCELERATION-LIMITED, which v1 is not: there a fielder is at full speed on
 * the frame the ball is hit and stops dead the frame it is caught. That is not a
 * cosmetic difference — `defense.cpuReaction` records that its 1050ms partial
 * reading was NOT promoted because "a displacement threshold cannot separate a
 * DECISION DELAY from an ACCELERATION RAMP", and v1 could only ever have been
 * measuring the first because it does not have the second. Here they are
 * separate quantities: `readyAtSec` is the read, and the ramp is physics.
 *
 * There is no deceleration on approach. A fielder converging on a ball is not
 * trying to stop there, and `moveToward` already refuses to overshoot the point.
 */
export function stepFielder(
  f: FielderState,
  target: Vec2,
  dtSec: number,
  nowSec: number,
  geo: FieldGeometry
): void {
  if (isFrozen(f, nowSec)) {
    f.speedFts = 0;
    return;
  }
  const d = dist(f.p, target);
  if (d <= 0) {
    f.speedFts = 0;
    return;
  }
  const top = f.topFts;
  const next = f.speedFts + f.accelFtS2 * dtSec;
  f.speedFts = next > top ? top : next;
  const step = f.speedFts * dtSec;
  // Clamped because the TARGET can legally be somewhere a fielder may not
  // stand: `BOUNCE.BALL_SETTLE_MARGIN_FT` lets a ball rest 1ft from the wall
  // while `FIELD_MARGIN` holds a kid at 4ft. That 3ft is exactly the reach.
  f.p = clampToField(geo, moveToward(f.p, target, step > d ? d : step));
}

// --- Catching ---------------------------------------------------------------

/**
 * How far this kid can reach right now, ft. A dive buys `DIVE_REACH_FT` for
 * `DIVE_WINDOW_SEC` and costs a face-down freeze if it comes up empty.
 */
export function reachOf(f: FielderState, nowSec: number): number {
  const diving = f.diveUntilSec !== null && nowSec < f.diveUntilSec;
  return reachFt() + (diving ? DEFENSE.DIVE_REACH_FT : 0);
}

/**
 * Is the ball inside this kid's glove?
 *
 * ★ HEIGHT COUNTS, and in v1 it does not. v1 tests `dist(chaser.pos, b.pos)` in
 * the flat plane for a fly ball, so a fielder standing under a ball 40ft up is
 * "within 34px" of it and catches it — the only thing stopping that is
 * `CATCHABLE_TAIL`, a rule that the last 40% of the flight is catchable, which
 * is a timing fudge standing in for a geometry fact.
 *
 * ★ BUT THE ENVELOPE IS NOT A SPHERE, AND MAKING IT ONE BROKE THE INFIELD. A
 * sphere of radius 3ft centred on a kid's chest gives a ball lying ON THE GROUND
 * a horizontal reach of sqrt(3² - 2.88²) = 0.84ft: the fielder has to stand
 * almost exactly on top of a grounder to pick it up. That is not what a child
 * does — they crouch — and the symptom was every routine grounder in the game
 * turning into a chase to the outfield wall while the election insisted the
 * shortstop had cut it off. He had; he just could not bend over.
 *
 * So: below chest height the reach is CYLINDRICAL (crouch and extend, full
 * `reachOf` in any direction), and above it spherical about the chest, which is
 * an arm sweeping overhead. The ceiling is unchanged — chest plus a reach, so a
 * ball above about 6ft is nobody's, whenever in its flight it happens to be.
 */
export function canReach(f: FielderState, ball: Vec3, nowSec: number): boolean {
  if (isFrozen(f, nowSec)) return false;
  return withinReach(f, ball, reachOf(f, nowSec));
}

/**
 * Would a DIVE get him there, when standing up will not?
 *
 * ★ THE QUESTION A CPU DEFENCE HAS TO ASK, and until PR 10 nothing asked it:
 * `startDive` had no caller anywhere, so `DIVE_REACH_FT`, `DIVE_WINDOW_SEC` and
 * `DIVE_WHIFF_SEC` were consumed only by tests. Same shape as `isFair` in PR 7
 * and `BASE_COVER` in PR 6 — authored, tested, and reachable by nothing.
 *
 * The envelope is the standing one at the diving radius, so the capsule rule
 * (`sim.catchRadius`) applies unchanged: a ball on the ground is reached by the
 * cylinder, not by a sphere centred on the chest.
 */
export function couldReachDiving(f: FielderState, ball: Vec3, nowSec: number): boolean {
  if (isFrozen(f, nowSec) || f.diveUntilSec !== null) return false;
  return withinReach(f, ball, reachFt() + DEFENSE.DIVE_REACH_FT);
}

/** The catch envelope at an explicit reach: cylinder below the chest, sphere above. */
function withinReach(f: FielderState, ball: Vec3, r: number): boolean {
  const dx = ball.x - f.p.x;
  const dz = ball.z - f.p.z;
  const flat = Math.sqrt(dx * dx + dz * dz);
  if (ball.y <= DEFENSE.CATCH_CENTRE_FT) return flat <= r;
  const dy = ball.y - DEFENSE.CATCH_CENTRE_FT;
  return Math.sqrt(flat * flat + dy * dy) <= r;
}

/**
 * Does the ball stick? v1's `rollCatch`, in feet and on an injected `Rng`.
 *
 * `rng.bool` always draws, even at a degenerate probability, so a mode that
 * happens to make errors impossible cannot shift the stream for everyone else.
 */
export function tryCatch(
  f: FielderState,
  kind: 'fly' | 'grounder',
  rng: Rng,
  dropBase: number = DEFENSE.DROP_BASE
): boolean {
  const base = Math.max(0.01, dropBase - (f.glove - 5) * DEFENSE.DROP_PER_GLOVE);
  const drop = kind === 'fly' ? base : base * DEFENSE.BOBBLE_FACTOR;
  return !rng.bool(drop);
}

/** Start a dive. Returns false if this kid is in no state to. */
export function startDive(f: FielderState, nowSec: number): boolean {
  if (isFrozen(f, nowSec) || f.diveUntilSec !== null) return false;
  f.diveUntilSec = nowSec + DEFENSE.DIVE_WINDOW_SEC;
  return true;
}

/** Close out a dive window. Returns true if it came up empty (and freezes). */
export function settleDive(f: FielderState, nowSec: number): boolean {
  if (f.diveUntilSec === null || nowSec < f.diveUntilSec) return false;
  f.diveUntilSec = null;
  if (f.hasBall) return false;
  f.fumbleUntilSec = Math.max(f.fumbleUntilSec, nowSec + DEFENSE.DIVE_WHIFF_SEC);
  return true;
}

/** Muff it: the ball is live where it fell and the kid is flustered. */
export function fumble(f: FielderState, nowSec: number): void {
  f.hasBall = false;
  f.diveUntilSec = null;
  f.fumbleUntilSec = nowSec + DEFENSE.FUMBLE_SEC;
}

// --- Throwing ---------------------------------------------------------------

/**
 * How long a throw takes to cover `from -> to`, seconds, or null if this arm
 * cannot get there on the fly.
 *
 * ★ CLOSED FORM, AND WITHOUT TRIG. For a projectile at speed `v` covering a
 * horizontal range `R`, `sin(2θ) = Rg/v²`, and the flat (fast) root has
 *
 *     t = (2v/g) * sqrt((1 - sqrt(1 - k²)) / 2) ,   k = Rg/v²
 *
 * via `sinθ = sqrt((1 - cos2θ)/2)` with `cos2θ = +sqrt(1 - k²)`. Only `sqrt`,
 * so this file stays on the purity lint's HOT list.
 *
 * ★ IT IGNORES DRAG, AND THAT IS A RECORDED SIMPLIFICATION rather than an
 * oversight. Everything the BALL does is integrated with drag and Magnus;
 * a throw is not, because solving a release elevation against drag needs the
 * same iteration `releasePitch` runs and a throw happens far more often. The
 * error is optimistic — a vacuum range overstates a real one — so the honest
 * reading of `maxThrowFt` is an upper bound on what an arm can do.
 *
 * ★ AND IT MAKES THE RELAY REAL RATHER THAN INVENTED. At stat 5 the maximum
 * range is 96.5ft, and centre field to first base is 125ft: an average kid in
 * centre PHYSICALLY CANNOT throw to first. v1 had to invent `LIVE.RELAY` and
 * gate it on a hand-picked depth in basepath legs, because at its geometry the
 * longest throw that existed anywhere on the field was 418px and a coin-flip at
 * first needed 806. Here the cutoff man is a consequence of an arm.
 */
export function throwFlightSec(from: Vec2, to: Vec2, pitchingStat: number): number | null {
  const v = throwSpeedFts(pitchingStat);
  const R = dist(from, to);
  if (R <= 0) return 0;
  const k = (R * G) / (v * v);
  if (k > 1) return null;
  const cos2 = Math.sqrt(1 - k * k);
  return ((2 * v) / G) * Math.sqrt((1 - cos2) / 2);
}

/** The furthest this arm can throw on the fly, ft. An upper bound: no drag. */
export function maxThrowFt(pitchingStat: number): number {
  const v = throwSpeedFts(pitchingStat);
  return (v * v) / G;
}

// --- Who goes and gets it ---------------------------------------------------

export interface ChasePick {
  /** Index into the fielder array. */
  index: number;
  /** Where they should run to. */
  point: Vec2;
  /** When they get there, seconds. Infinity when nobody can head it off. */
  sec: number;
}

/**
 * How long this kid needs to cover `ft`, from where they are standing.
 *
 * From the fielder's OWN legs, not re-derived from their stat — see
 * `sprintTimeForFt`. The election must rank the fielders it is given.
 */
function timeToCover(f: FielderState, ft: number): number {
  return sprintTimeForFt(ft, f.topFts, f.accelFtS2, f.speedFts);
}

/** Is the ball settling anywhere near this position's post? */
function withinLeash(f: FielderState, settle: Vec2): boolean {
  return dist(f.home, settle) <= DEFENSE.LEASH_FT[f.position];
}

/**
 * The first point on the ball's path this kid can beat it to, or null.
 *
 * The reach is subtracted from the distance, because a fielder does not have to
 * stand on the ball to have it.
 *
 * ★ AND THE READ COUNTS. A kid who has not seen the ball yet is not running, so
 * the time still to elapse on `readyAtSec` is part of the journey. Leaving it
 * out sends the wrong kid: the first version elected a shortstop whose cut-off
 * was 1.42s away when he would not start moving for 0.46s of it, the ball went
 * past him at 7ft, and he trailed it 80 feet into left field before catching up
 * with it at rest. Nothing was wrong with the pursuit — the ELECTION had been
 * asked a question about a fielder who does not exist.
 */
function cutOff(f: FielderState, path: readonly PathSample[], nowSec: number): PathSample | null {
  const reach = reachFt();
  const wait = f.readyAtSec > nowSec ? f.readyAtSec - nowSec : 0;
  for (const s of path) {
    if (s.tSec < nowSec) continue; // already happened
    const gap = dist(f.p, s.p) - reach;
    if (nowSec + wait + timeToCover(f, gap > 0 ? gap : 0) <= s.tSec + DEFENSE.CUTOFF_GRACE_SEC) return s;
  }
  return null;
}

/**
 * Who chases a loose ball.
 *
 * Two regimes, both v1's:
 *   - IN THE AIR: nearest to where it will land. Correct, and unchanged.
 *   - ON THE GROUND: earliest CUT-OFF among fielders whose leash covers the
 *     settle point, with the zone owner keeping it unless somebody is
 *     decisively sooner.
 *
 * ★ THE SECOND GATE IS NOT OPTIONAL AND IT IS NOT THE SAME AS THE FIRST. The
 * leash stops the pitcher fielding every grounder in the game (a grounder starts
 * at home, so P is nearest its early path at every spray angle). The zone-owner
 * rule stops a third baseman charging across in FRONT of the shortstop to reach
 * a ball rolling at him, which the cut-off ranking alone genuinely rewards.
 */
export function electChaser(args: {
  fielders: readonly FielderState[];
  trace: LooseTrace;
  /** Is the ball still up? The trace carries where it will come down. */
  inAir: boolean;
  /**
   * Where we are on the trace's clock. Zero at contact; pass the landing time to
   * RE-ELECT when the ball comes down, which is what v1's `reelect` flag does at
   * every land, carom, bonk and fumble. Also what makes a kid's remaining read
   * count: a fielder who has not seen it yet is not running.
   */
  nowSec?: number;
}): ChasePick {
  const { fielders, trace, inAir } = args;
  const nowSec = args.nowSec ?? 0;
  const settle = trace.settle;

  if (inAir) {
    const point = trace.landing ?? settle;
    let best = 0;
    let bestSec = Infinity;
    for (let i = 0; i < fielders.length; i++) {
      const wait = fielders[i].readyAtSec > nowSec ? fielders[i].readyAtSec - nowSec : 0;
      const sec = wait + timeToCover(fielders[i], Math.max(0, dist(fielders[i].p, point) - reachFt()));
      if (sec < bestSec) {
        bestSec = sec;
        best = i;
      }
    }
    return { index: best, point: { ...point }, sec: bestSec };
  }

  // ★ The pool falls back to EVERYONE when the leash excludes everyone, so the
  // election can never return nobody. v1 carries the same fallback.
  //
  // ★ AND CANDIDACY IS ALSO EARNED BY THE INTERCEPT, NOT ONLY BY THE SETTLE.
  // The leash keys on where the ball COMES TO REST, and that silently excluded
  // every infielder from any grounder destined for the outfield — including
  // ones passing within arm's length of them. Measured: a 51mph grounder at -20
  // degrees passes 9.8ft from the shortstop's post at t=1.05s, comfortably
  // inside his range, and settles 205ft away in left. His post is 129ft from
  // that settle point against an 84ft leash, so he was not a candidate at all;
  // the LEFT FIELDER collected it at t=2.90 and had to relay. That is the real
  // reason ground balls were 83.5% hits, and it is why PR 10's first step bought
  // almost nothing on grounders — the infielders were never in the election.
  //
  // The settle key is KEPT, because it is what stops the pitcher poaching every
  // grounder (he is nearest the early path at every spray angle, which is the
  // failure `LEASH_FT` was introduced for). A fielder is now eligible if the
  // ball settles in his zone OR he can intercept it near his own post — the
  // second is a strictly additional door, so nothing that used to qualify stops
  // qualifying.
  const eligible: number[] = [];
  for (let i = 0; i < fielders.length; i++) {
    const f = fielders[i];
    if (withinLeash(f, settle)) {
      eligible.push(i);
      continue;
    }
    const hit = cutOff(f, trace.samples, nowSec);
    if (hit && withinLeash(f, hit.p)) eligible.push(i);
  }
  const pool = eligible.length > 0 ? eligible : fielders.map((_, i) => i);

  const scored = pool.map((i) => {
    const hit = cutOff(fielders[i], trace.samples, nowSec);
    return { i, hit, sec: hit ? hit.tSec : Infinity, zone: dist(fielders[i].home, settle) };
  });

  const owner = scored.reduce((a, b) => (b.zone < a.zone ? b : a));
  let best = owner;
  for (const c of scored) {
    if (c === owner || !c.hit) continue;
    // The ratio gate. Scaling every speed in the game scales both sides, so the
    // override rate is invariant — which v1's fixed 400ms provably is not.
    if (c.sec * (1 + DEFENSE.CUT_AHEAD_FRAC) >= owner.sec) continue;
    if (best === owner || c.sec < best.sec || (c.sec === best.sec && c.zone < best.zone)) best = c;
  }

  if (best.hit) return { index: best.i, point: { ...best.hit.p }, sec: best.sec };
  // Nobody heads it off: it is through the infield. Send the zone owner to where
  // it will stop, which is the old rule and the right one for a ball that has
  // already beaten the defence.
  return { index: owner.i, point: { ...settle }, sec: Infinity };
}

/**
 * Where the elected chaser should actually run RIGHT NOW.
 *
 * ★ NOT AT THE BALL. v1's `chaseTarget` carries the whole argument: "pure
 * pursuit trails a rolling ball instead of heading it off". Aiming at the
 * election's cut-off point is what makes the election mean anything — and
 * writing this test harness without it is what turned a routine grounder into
 * an infinite chase the first time it ran.
 *
 * Once the ball is nearer its resting place than the cut-off point is, the
 * cut-off has been passed and the ball itself is the target.
 */
export function chaseTarget(trace: LooseTrace, ballP: Vec2, pick: ChasePick, inAir: boolean): Vec2 {
  if (inAir) return trace.landing ?? trace.settle;
  const end = trace.settle;
  return dist(ballP, end) > dist(pick.point, end) ? pick.point : ballP;
}

/**
 * Should the job actually change hands?
 *
 * Three guards, all of which v1 needed:
 *   1. a chaser already ON the ball keeps it — "you're on it, it's yours", which
 *      is also what stops the steered kid being taken away mid-reach;
 *   2. handovers cannot come faster than `SWITCH_COOLDOWN_SEC`;
 *   3. the challenger must beat the incumbent's own score, measured from where
 *      the incumbent is NOW, by `SWITCH_MARGIN_FRAC` — a ratio for the same
 *      reason the cut-ahead gate is one.
 */
export function shouldSwitch(args: {
  challenger: ChasePick;
  incumbent: number;
  incumbentToBallFt: number;
  incumbentSec: number | null;
  sinceElectionSec: number;
}): boolean {
  const { challenger, incumbent, incumbentToBallFt, incumbentSec, sinceElectionSec } = args;
  if (challenger.index === incumbent) return false;
  if (incumbent < 0) return true;
  if (incumbentToBallFt <= DEFENSE.KEEP_RADIUS_FT) return false;
  if (sinceElectionSec < DEFENSE.SWITCH_COOLDOWN_SEC) return false;
  if (incumbentSec === null) return true;
  return challenger.sec * (1 + DEFENSE.SWITCH_MARGIN_FRAC) < incumbentSec;
}

/** Re-export so a consumer never has to reach past this file for the trace. */
export type { LooseTrace, PathSample };
