// ---------------------------------------------------------------------------
// The play reducer. PURE.
//
// A batted ball, nine kids with gloves and up to four runners, stepped to an
// outcome. This is the file that turns PR 5's parts into a defence: until now
// nothing set `FielderState.hasBall`, `DEFENSE.RELEASE_SEC` was consumed only by
// tests, `BASE_COVER` was read by nothing at all, and the only thing that put a
// chase next to a runner was a test-only harness that declared its own bias.
//
// ★ WHAT IS DELIBERATELY NOT HERE. Human steering, the throw-charge meter, the
// dive verb, the fielding assist, tag-ups, sac flies and steals. Every one of
// them needs a player, and v2 has no input membrane yet; shipping them now would
// repeat what `field.ts` did with its four venue fields — authored, tested, and
// consumed by nothing for months. `PlayInputs` is here as a typed seam so the
// signature does not change when they land. Everything below is CPU-driven, on
// both sides, which is exactly what PR 8's harness needs.
//
// ★ THE TICK ORDER IS v1's, VERBATIM, and it is load-bearing rather than
// arbitrary. `systems/liveplay.ts` runs
//
//     ball -> (re-elect) -> fielders -> grab -> (re-elect) -> throw
//          -> runners -> carrier-touches-bags -> running policy -> termination
//
// and its own comment for the first re-election is the reason: "The ball turned
// up somewhere new this tick (landed, caromed, bonked) — re-run the election
// BEFORE anyone moves, so the handover costs no ground." The rest follows the
// same logic: you can throw the tick you secure it; runners move before outs are
// adjudicated at bags; the running policy runs after legs complete (which is why
// `RUN.BASE_DWELL_SEC` exists at all); termination is last so a play that ends
// emits `playOver` in the same tick as its final out.
//
// ★ AND THE RNG IS FORKED ONCE, AT `beginPlay`. A play draws for drops and for
// throw errors, and if those came off one stream the ORDER of the draws would be
// part of the contract again — the exact class `Rng.fork` was built to delete.
// Each kind of decision gets its own substream, held on the state, so adding a
// draw to one cannot move another.
// ---------------------------------------------------------------------------

import type { Character } from '../../data/types';
import { DEFENSE, PLAY } from './params';
import { reachFt, sprintTimeForFt } from './athletes';
import { launch, type LaunchSpec } from './launch';
import type { BallState } from './flight';
import {
  stepLooseBallFull,
  traceLooseBall,
  settleBallAt,
  type BallPhase,
  type LooseTrace,
} from './bounce';
import {
  canReach,
  chaseTarget,
  electChaser,
  fumble,
  isFrozen,
  makeFielder,
  shouldSwitch,
  stepFielder,
  throwFlightSec,
  tryCatch,
  type ChasePick,
  type FielderState,
} from './fielders';
import {
  isSettled,
  makeRunner,
  mayBeSent,
  remainingFt,
  runnerPos,
  settleRunner,
  startLeg,
  stepRunner,
  type Base,
  type RunnerState,
} from './runners';
import {
  BASE_COVER,
  basePos,
  dist,
  FIELD_POSITIONS,
  type FieldGeometry,
  type PositionId,
  type Vec2,
} from './field';
import type { Rng } from './rng';

// --- Types ------------------------------------------------------------------

/**
 * What a throw is aimed at: a BAG (an out is possible) or a TEAMMATE (a relay —
 * nobody can be put out on it).
 *
 * ★ A DISCRIMINATED UNION ON PURPOSE, carried over from v1 with its reasoning
 * intact: "Every consumer has a genuinely different answer for the two cases, so
 * this turns each one into a compile error instead of a silent wrong answer."
 * `at` freezes the aim point at RELEASE — a throw does not home on a moving
 * cutoff man.
 */
export type ThrowTarget =
  | { kind: 'base'; base: 1 | 2 | 3 | 4 }
  | { kind: 'fielder'; idx: number; at: Vec2 };

export interface ThrowState {
  target: ThrowTarget;
  from: Vec2;
  releasedAtSec: number;
  arrivesAtSec: number;
}

export type PlayEvent =
  | { t: 'land' }
  | { t: 'carom' }
  | { t: 'bonk' }
  | { t: 'catch'; fielder: string }
  | { t: 'pickup'; fielder: string }
  | { t: 'error'; kind: 'drop' | 'bobble'; fielder: string }
  | { t: 'throw'; toBase: 1 | 2 | 3 | 4; fielder: string }
  // A relay leg. Deliberately NOT an overloaded `throw` with an optional base:
  // every `throw` event carries a bag, and a relay has none.
  | { t: 'relay'; fielder: string; to: string }
  | { t: 'out'; base: 1 | 2 | 3 | 4; runner: string }
  | { t: 'safe'; base: 1 | 2 | 3; runner: string }
  | { t: 'score'; runner: string }
  | { t: 'run'; runner: string }
  | { t: 'homeRun' }
  | { t: 'playOver' };

/** The seam. Nothing reads it yet — see the header. */
export interface PlayInputs {
  pointer?: Vec2;
  dive?: boolean;
  throwTo?: { base: 1 | 2 | 3 | 4 };
  sendRunner?: string;
  holdRunner?: string;
}

export interface PlayState {
  phase: 'live' | 'done';
  elapsedSec: number;
  geo: FieldGeometry;

  ball: BallState;
  ballPhase: BallPhase;
  /** Fielder index holding it, or null. */
  heldBy: number | null;
  throw: ThrowState | null;
  /** Where the ball is predicted to go. Refreshed only on a re-election. */
  trace: LooseTrace;

  fielders: FielderState[];
  runners: RunnerState[];
  /** The elected chaser. */
  active: number;
  chase: ChasePick;
  electedAtSec: number;
  /** Bag index -> fielder index assigned to take a throw there. */
  cover: Map<1 | 2 | 3 | 4, number>;

  outsBefore: number;
  outs: number;
  runs: number;
  flyCaught: boolean;
  homeRun: boolean;
  landedAtSec: number | null;
  /** When the ball was last secured — the release clock runs off this. */
  heldAtSec: number;
  relayLegs: number;

  /**
   * Something the GRAB phase shook loose (a muff, a blown relay, an overthrow).
   * Consumed once per tick, after the grab — v1 carries the same flag for the
   * same reason: the thing that loosens the ball is not where `geo` and the
   * fielder list are both in scope to re-run an election.
   */
  pendingReelect: boolean;
  /** When the defence last re-read the ball. Not the same as a handover. */
  lastReadSec: number;
  events: PlayEvent[];
  rng: { drop: Rng; wild: Rng };
}

/**
 * Structurally identical to v1's `LiveOutcome`, and that is the point: the type
 * is already unit-free, `systems/inning.ts` type-imports it, and `applyLivePlay`
 * reads only `outs`, `runs`, `bases` and `batterOut`. So PR 7 can fold a v2 play
 * into a v1 half-inning with no adapter. This file does NOT import `inning` to
 * do it — the fold-back is PR 7's job, and a value import would put the game
 * layer inside the play.
 */
export interface PlayOutcome {
  outs: number;
  runs: number;
  bases: [boolean, boolean, boolean];
  baseIds: [string | null, string | null, string | null];
  batterOut: boolean;
  flyCaught: boolean;
  description: string;
}

export interface PlaySpec {
  launch: LaunchSpec;
  batter: Character;
  runners?: Array<{ base: 1 | 2 | 3; char: Character }>;
  /** charId -> position. `systems/lineup.ts` `autoAssign().positions` fits. */
  defence: Record<string, PositionId>;
  lookup: (id: string) => Character;
  outs?: number;
  geo: FieldGeometry;
}

// --- Setup ------------------------------------------------------------------

export function beginPlay(spec: PlaySpec, rng: Rng): PlayState {
  const ball = launch(spec.launch);
  const fielders = Object.entries(spec.defence).map(([id, pos]) =>
    makeFielder(spec.lookup(id), pos, { nowSec: 0 })
  );
  const runners: RunnerState[] = [
    ...(spec.runners ?? []).map((r) => makeRunner(r.char, r.base, 0)),
    makeRunner(spec.batter, 0, 0),
  ];

  const trace = traceLooseBall(ball, spec.geo, {
    horizonSec: DEFENSE.CHASE_HORIZON_SEC,
    samples: Math.round(DEFENSE.CHASE_HORIZON_SEC / DEFENSE.CHASE_STEP_SEC),
  });
  const chase = electChaser({ fielders, trace, inAir: trace.landAtSec !== null, nowSec: 0 });

  const s: PlayState = {
    phase: 'live',
    elapsedSec: 0,
    geo: spec.geo,
    ball,
    ballPhase: 'flight',
    heldBy: null,
    throw: null,
    trace,
    fielders,
    runners,
    active: chase.index,
    chase,
    electedAtSec: 0,
    cover: new Map(),
    outsBefore: spec.outs ?? 0,
    outs: 0,
    runs: 0,
    flyCaught: false,
    homeRun: false,
    landedAtSec: null,
    heldAtSec: -Infinity,
    relayLegs: 0,
    pendingReelect: false,
    lastReadSec: 0,
    events: [],
    rng: { drop: rng.fork('drop'), wild: rng.fork('wild') },
  };

  // The batter always runs. A runner FORCED by the batter must too — but on a
  // fly they wait to see it, exactly as v1's CPU does ("the CPU's runners wait
  // on flies like real kids and go once it lands").
  startLeg(runners[runners.length - 1], 1);
  assignCover(s);
  return s;
}

// --- The tick ---------------------------------------------------------------

export function stepPlay(s: PlayState, dtSec: number, _inputs: PlayInputs = {}): PlayState {
  s.events = [];
  if (s.phase === 'done' || dtSec <= 0) return s;
  s.elapsedSec += dtSec;

  const moved = advanceBall(s, dtSec);
  // ★ The ball turned up somewhere new — re-elect BEFORE anyone moves, so the
  // handover costs no ground. v1's ordering comment, and its reason.
  //
  // ★ AND ON A TIMER TOO, which v1 does not do and needs. Events alone are not
  // enough: a grounder raises exactly one (`land`), and if that one falls inside
  // `SWITCH_COOLDOWN_SEC` of the election at contact then `shouldSwitch` refuses
  // it and the wrong kid keeps the ball for the whole play. The cooldown exists
  // to stop flicker, not to make the first guess permanent. Handovers are still
  // gated by it; only the re-READ is periodic.
  const stale = s.elapsedSec - s.lastReadSec >= DEFENSE.SWITCH_COOLDOWN_SEC;
  if (moved || (stale && s.heldBy === null && !s.throw)) reelect(s);

  moveFielders(s, dtSec);
  tryGrab(s);
  // ...and again for anything the grab phase shook loose.
  if (s.pendingReelect) reelect(s);

  maybeThrow(s);
  moveRunners(s, dtSec);
  carrierTouchesBags(s);
  decideRunning(s);
  checkTermination(s);
  return s;
}

/** Run a whole play to its outcome. The entry point PR 8's harness wants. */
export function simulatePlay(spec: PlaySpec, rng: Rng, dtSec = 1 / 120): PlayOutcome {
  const s = beginPlay(spec, rng);
  let guard = 0;
  while (s.phase === 'live' && guard++ < Math.ceil(PLAY.MAX_PLAY_SEC / dtSec) + 8) {
    stepPlay(s, dtSec);
  }
  return finishPlay(s);
}

// --- The ball ---------------------------------------------------------------

/** Advance the ball. Returns true if it turned up somewhere new. */
function advanceBall(s: PlayState, dtSec: number): boolean {
  if (s.throw) {
    if (s.elapsedSec >= s.throw.arrivesAtSec) return arriveThrow(s);
    return false;
  }
  if (s.heldBy !== null) {
    // Carried. The ball goes where the kid goes.
    const p = s.fielders[s.heldBy].p;
    s.ball.p.x = p.x;
    s.ball.p.z = p.z;
    s.ball.p.y = DEFENSE.CATCH_CENTRE_FT;
    return false;
  }

  // ★ Through `stepLooseBallFull`, which consumes the whole tick including the
  // remainder an event leaves behind — and which `traceLooseBall` also calls, so
  // the prediction and the play are one implementation rather than two that
  // agree. A test flies the played ball and the traced one and compares them.
  const r = stepLooseBallFull(s.ball, s.ballPhase, s.geo, dtSec);
  s.ball = r.state;
  s.ballPhase = r.phase;
  if (r.leftPark) {
    s.homeRun = true;
    return false;
  }
  let moved = false;
  for (const e of r.events) moved = noteBallEvent(s, e.event) || moved;
  return moved;
}

/** Record what just happened to the ball. Returns whether to re-elect. */
function noteBallEvent(s: PlayState, event: 'land' | 'carom' | 'bonk' | 'rest'): boolean {
  if (event === 'land') {
    // ★ FIRST TOUCH ONLY. A batted ball hops several times before it rolls, and
    // v1 is explicit that hops do not re-land ("first touch only"). Re-electing
    // on every hop hands the chase to whoever happens to be nearest the NEXT
    // bounce, which for a grounder skipping through the infield is a different
    // kid every quarter-second.
    if (s.landedAtSec !== null) return false;
    s.landedAtSec = s.elapsedSec;
    s.events.push({ t: 'land' });
    return true;
  }
  if (event === 'carom') {
    s.events.push({ t: 'carom' });
    return true;
  }
  if (event === 'bonk') {
    s.events.push({ t: 'bonk' });
    return true;
  }
  return false;
}

// --- Election ---------------------------------------------------------------

/**
 * Re-predict the ball's path from where it actually is, and hand the chase over
 * if somebody is now decisively better placed.
 *
 * ★ NOT EVERY TICK, which v1 is explicit about: "Deliberately NOT every tick:
 * that would flicker the kid the player is steering, for no gain." Here it costs
 * a full trace, so it is also the expensive thing in the loop.
 */
function reelect(s: PlayState): void {
  s.pendingReelect = false;
  if (s.heldBy !== null || s.throw) return;
  s.lastReadSec = s.elapsedSec;
  s.trace = traceLooseBall(s.ball, s.geo, {
    horizonSec: DEFENSE.CHASE_HORIZON_SEC,
    samples: Math.round(DEFENSE.CHASE_HORIZON_SEC / DEFENSE.CHASE_STEP_SEC),
  });
  const inAir = isCatchableFly(s);
  // ★ THE TRACE RESTARTS AT ZERO AND THE PLAY CLOCK DOES NOT, and reconciling
  // the two is not optional. `electChaser` adds each kid's REMAINING read to
  // their travel time (PR 5's finding), measuring it as `readyAtSec - nowSec` on
  // the trace's clock. Handing it absolute times charges every fielder their
  // whole reaction again on the second election, half a second after they
  // already reacted — the election then believes in a defence that is still
  // standing still and picks accordingly.
  const onTraceClock = s.fielders.map((f) =>
    f.readyAtSec <= s.elapsedSec ? f : { ...f, readyAtSec: f.readyAtSec - s.elapsedSec }
  );
  const pick = electChaser({ fielders: onTraceClock, trace: s.trace, inAir, nowSec: 0 });
  const incumbent = s.fielders[s.active];
  // ★ THE INCUMBENT IS SCORED TOO, by a solo election from where they are NOW.
  // `shouldSwitch`'s third guard is "the challenger must beat the incumbent's
  // own score", and passing null for that score means the guard cannot run —
  // every challenger wins and the hysteresis is gone. v1 runs the same solo
  // election for the same reason.
  //
  // Also belt-and-braces as of this PR: with periodic re-reads the chase
  // converges on the right kid either way, so passing null breaks no test. Kept
  // because a defence that changes its mind every half second is a real defect
  // even when the final answer is the same, and because it costs one election.
  const solo = electChaser({
    fielders: [onTraceClock[s.active]],
    trace: s.trace,
    inAir,
    nowSec: 0,
  });
  const swap = shouldSwitch({
    challenger: pick,
    incumbent: s.active,
    incumbentToBallFt: dist(incumbent.p, { x: s.ball.p.x, z: s.ball.p.z }),
    incumbentSec: Number.isFinite(solo.sec) ? solo.sec : null,
    sinceElectionSec: s.elapsedSec - s.electedAtSec,
  });
  s.chase = pick;
  if (swap) {
    s.active = pick.index;
    s.electedAtSec = s.elapsedSec;
  }
  assignCover(s);
}

/**
 * Is this a ball somebody could get UNDER, or one they have to cut off?
 *
 * ★ THE TWO REGIMES SPLIT ON HEIGHT, NOT ON PHASE, and that took two bugs to
 * find. A ball skipping through the infield is airborne between hops, so
 * "phase === flight" put a grounder in the AIR regime — nearest to the next
 * landing spot — for its whole life. The pitcher fielded one forty feet behind
 * the shortstop because he was nearest to every individual hop, and once hops
 * stopped re-electing, the CATCHER kept a ball he had been handed at contact
 * for a landing spot fifteen feet from the plate.
 *
 * What makes a ball catchable in the air is that it rises above a kid's glove.
 * That is `CATCH_CENTRE_FT + reachFt()` — the same ceiling `canReach` enforces —
 * so the election and the catch agree on what a fly is.
 *
 * ★ AND IT IS NOW BELT-AND-BRACES, which is worth saying rather than implying.
 * Reverting this to `ballPhase === 'flight'` no longer breaks any test: the
 * other two fixes from the same bug (hops do not re-land, and the defence
 * re-reads on a timer instead of only on events) each independently stop the
 * wrong kid keeping the ball. It stays because it is the CORRECT concept and
 * the other two are about frequency, not meaning — but it is redundancy, not a
 * gated invariant, and the verification sweep records it as such.
 */
function isCatchableFly(s: PlayState): boolean {
  return s.landedAtSec === null && s.trace.apexFt > DEFENSE.CATCH_CENTRE_FT + reachFt();
}

/**
 * Who stands on each bag to take a throw.
 *
 * `BASE_COVER` is the preference — it is the conventional assignment and it is
 * what `field.ts` has held, unused, since it was written. But the assignment has
 * to SELF-HEAL: a corner infielder can be elected chaser and run into the
 * corner, and v1 records what happens if you ignore that ("blindly using the
 * cover fielder would teleport them back across the field to receive a throw at
 * their own bag"). So when the conventional coverer is busy, the nearest free
 * kid takes it — which is also what really happens when the pitcher covers first.
 */
function assignCover(s: PlayState): void {
  s.cover.clear();
  const taken = new Set<number>([s.active]);
  if (s.heldBy !== null) taken.add(s.heldBy);
  for (const base of [1, 2, 3, 4] as const) {
    const bag = basePos(base);
    const want = BASE_COVER[base];
    let pick = s.fielders.findIndex((f, i) => f.position === want && !taken.has(i));
    if (pick < 0) {
      let best = Infinity;
      s.fielders.forEach((f, i) => {
        if (taken.has(i)) return;
        const d = dist(f.p, bag);
        if (d < best) {
          best = d;
          pick = i;
        }
      });
    }
    if (pick >= 0) {
      s.cover.set(base, pick);
      taken.add(pick);
    }
  }
}

// --- Fielders ---------------------------------------------------------------

function moveFielders(s: PlayState, dtSec: number): void {
  const ballP = { x: s.ball.p.x, z: s.ball.p.z };
  const inAir = s.ballPhase === 'flight' && s.heldBy === null && !s.throw;
  for (let i = 0; i < s.fielders.length; i++) {
    const f = s.fielders[i];
    let target: Vec2;
    if (i === s.active && s.heldBy === null && !s.throw) {
      // ★ Through `chaseTarget`, never at the ball. Aiming at a rolling ball is
      // pure pursuit, which trails it instead of heading it off.
      target = chaseTarget(s.trace, ballP, s.chase, inAir);
    } else if (i === s.heldBy) {
      target = carrierTarget(s, f);
    } else {
      const bag = [...s.cover.entries()].find(([, idx]) => idx === i);
      target = bag ? basePos(bag[0]) : FIELD_POSITIONS[f.position];
    }
    stepFielder(f, target, dtSec, s.elapsedSec, s.geo);
  }
}

/**
 * Where the kid holding the ball goes.
 *
 * ★ HE HUNTS A TAGGABLE RUNNER, and only one that is genuinely taggable: off a
 * bag and NOT forced. Chasing a forced runner is pointless (the bag is the
 * cheaper out) and chasing an advancing runner is how v1 ended up with
 * outfielders footracing kids to the plate. If nobody is worth hunting he stands
 * still and throws.
 */
function carrierTarget(s: PlayState, f: FielderState): Vec2 {
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const r of s.runners) {
    if (r.done !== null || isSettled(r)) continue;
    if (isForced(s, r)) continue;
    const p = runnerPos(r);
    const d = dist(f.p, p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ?? f.p;
}

/** The single possession choke point. `heldBy === active` is its invariant. */
function secureBall(s: PlayState, idx: number): void {
  s.fielders.forEach((f, i) => {
    f.hasBall = i === idx;
  });
  s.heldBy = idx;
  s.active = idx;
  s.throw = null;
  s.ballPhase = 'atRest';
  s.heldAtSec = s.elapsedSec;
  s.ball.p.x = s.fielders[idx].p.x;
  s.ball.p.z = s.fielders[idx].p.z;
  s.ball.p.y = DEFENSE.CATCH_CENTRE_FT;
  s.ball.v = { x: 0, y: 0, z: 0 };
  s.ball.w = { x: 0, y: 0, z: 0 };
  assignCover(s);
}

function tryGrab(s: PlayState): void {
  if (s.heldBy !== null || s.throw || s.homeRun) return;
  const f = s.fielders[s.active];
  if (!canReach(f, s.ball.p, s.elapsedSec)) return;

  // ★ A FLY IS AN OUT ONLY BEFORE IT LANDS, which is a fact about the ball and
  // not a timer. v1 gates it on `CATCHABLE_TAIL` — "an airborne ball is
  // catchable in this last fraction of its flight" — a timing constant standing
  // in for the geometry `canReach` now has.
  const isFly = s.landedAtSec === null && s.ballPhase === 'flight';
  if (!tryCatch(f, isFly ? 'fly' : 'grounder', s.rng.drop)) {
    fumble(f, s.elapsedSec);
    s.ball = settleBallAt(s.ball, s.geo);
    s.ballPhase = 'atRest';
    s.events.push({ t: 'error', kind: isFly ? 'drop' : 'bobble', fielder: f.charId });
    if (isFly) s.landedAtSec = s.elapsedSec;
    s.pendingReelect = true;
    return;
  }

  secureBall(s, s.active);
  if (isFly) {
    s.flyCaught = true;
    s.events.push({ t: 'catch', fielder: f.charId });
    retireBatterOnCatch(s);
  } else {
    s.events.push({ t: 'pickup', fielder: f.charId });
  }
}

/**
 * A caught fly retires the batter and sends everyone else back.
 *
 * ★ THE FREE RETURN IS v1's KID RULE, AND IT IS A DEFERRAL. Real tag-up rules —
 * a runner who left early can be doubled off, and one who tags may be sent for
 * a sac fly — need a send decision, so they belong with the game loop that has
 * a player in it. Recorded rather than silently simplified: this makes the
 * OFFENSE slightly better than it will be, which is the opposite bias to the
 * one the old test harness carried.
 */
function retireBatterOnCatch(s: PlayState): void {
  for (const r of s.runners) {
    if (r.done !== null) continue;
    if (r.from === 0) {
      r.done = 'out';
      recordOut(s, 1, r.charId);
      continue;
    }
    settleRunner(r);
  }
}

function recordOut(s: PlayState, base: 1 | 2 | 3 | 4, runner: string): void {
  s.outs += 1;
  s.events.push({ t: 'out', base, runner });
}

/** The third out ends the play — no fourth. */
function halfHasThreeOuts(s: PlayState): boolean {
  return s.outsBefore + s.outs >= 3;
}

// --- Throwing ---------------------------------------------------------------

/** How long this runner still needs, seconds, from where they actually are. */
function runnerSecTo(r: RunnerState): number {
  const left = remainingFt(r);
  if (left <= 0) return 0;
  const v = Math.max(r.speedFts, 1);
  return left / v;
}

/**
 * The highest bag where a throw can still beat a runner, or null.
 *
 * v1's `bestBeatableBase`, with its clamp: a retreating runner's `to` can be
 * below 1, and base 0 is not a throwable target.
 */
function bestBeatableBase(s: PlayState, from: Vec2, arm: number): 1 | 2 | 3 | 4 | null {
  let best: 1 | 2 | 3 | 4 | null = null;
  const releaseLeft = Math.max(0, s.heldAtSec + DEFENSE.RELEASE_SEC - s.elapsedSec);
  for (const r of s.runners) {
    if (r.done !== null || isSettled(r)) continue;
    if (r.to < 1 || r.to > 4) continue;
    const base = r.to as 1 | 2 | 3 | 4;
    const flight = throwFlightSec(from, basePos(base), arm);
    if (flight === null) continue;
    if (releaseLeft + flight + PLAY.THROW_MARGIN_SEC >= runnerSecTo(r)) continue;
    if (best === null || base > best) best = base;
  }
  return best;
}

/**
 * A cutoff man for a bag this arm cannot reach: the teammate who minimises
 * (carrier -> them) + (them -> bag), both legs of which must be real throws.
 *
 * ★ AND THIS IS WHY THE RELAY EXISTS AT ALL. PR 5 measured that centre field to
 * first base is 129.7ft and 27 of 30 kids cannot throw it. v1 had to INVENT
 * `LIVE.RELAY` and gate it on a hand-picked 1.39 basepath legs, because "throw
 * DISTANCE provably cannot do this job: a coin-flip on a routine grounder needs
 * an 806px throw and the longest that exists is 418px". Here the cutoff is a
 * consequence of an arm, and nothing decides to have one.
 */
function pickCutoff(s: PlayState, from: Vec2, base: 1 | 2 | 3 | 4, arm: number): number | null {
  const bag = basePos(base);
  let best: number | null = null;
  let bestSec = Infinity;
  for (let i = 0; i < s.fielders.length; i++) {
    if (i === s.heldBy) continue;
    const f = s.fielders[i];
    const leg1 = throwFlightSec(from, f.p, arm);
    if (leg1 === null) continue;
    const leg2 = throwFlightSec(f.p, bag, f.arm);
    if (leg2 === null) continue;
    const total = leg1 + leg2;
    if (total < bestSec) {
      bestSec = total;
      best = i;
    }
  }
  return best;
}

function release(s: PlayState, target: ThrowTarget, at: Vec2): void {
  const carrier = s.fielders[s.heldBy!];
  const to = target.kind === 'base' ? basePos(target.base) : at;
  const flight = throwFlightSec(carrier.p, to, carrier.arm);
  if (flight === null) return;
  carrier.hasBall = false;
  s.heldBy = null;
  s.throw = {
    target,
    from: { ...carrier.p },
    releasedAtSec: s.elapsedSec,
    arrivesAtSec: s.elapsedSec + flight,
  };
  if (target.kind === 'base') {
    s.events.push({ t: 'throw', toBase: target.base, fielder: carrier.charId });
  } else {
    s.events.push({ t: 'relay', fielder: carrier.charId, to: s.fielders[target.idx].charId });
  }
  assignCover(s);
}

function maybeThrow(s: PlayState): void {
  if (s.heldBy === null || s.throw || s.phase === 'done') return;
  if (s.elapsedSec - s.heldAtSec < DEFENSE.RELEASE_SEC) return;
  const carrier = s.fielders[s.heldBy];

  const base = bestBeatableBase(s, carrier.p, carrier.arm);
  if (base !== null) {
    release(s, { kind: 'base', base }, basePos(base));
    return;
  }

  // Nothing is beatable from here. If the ball is still out in the outfield,
  // getting it back in is the play — that is what the relay IS. The leg cap is
  // the infinite-relay guard.
  if (s.relayLegs >= PLAY.RELAY_MAX_LEGS) return;
  const lead = leadRunnerTarget(s);
  if (lead === null) return;
  if (throwFlightSec(carrier.p, basePos(lead), carrier.arm) !== null) return; // in range, just not worth it
  const cutoff = pickCutoff(s, carrier.p, lead, carrier.arm);
  if (cutoff === null || cutoff === s.heldBy) return;
  s.relayLegs += 1;
  release(s, { kind: 'fielder', idx: cutoff, at: { ...s.fielders[cutoff].p } }, s.fielders[cutoff].p);
}

/**
 * How long the ball needs to reach `base`, seconds, counting the relay if the
 * carrier's arm cannot make it. `Infinity` when it simply cannot get there.
 *
 * ★ THIS REPLACES A HEURISTIC WITH AN ANSWER, and it is the v2 thesis applied to
 * baserunning. v1 sends a CPU runner when the ball is more than
 * `CPU_RUNNER_GREED_DIST` (180px, one basepath) from the next bag — a distance
 * standing in for a race, which cannot see that the kid holding it is 190ft away
 * with an arm that reaches 97. Here the runner asks the question directly, using
 * the same `throwFlightSec` the defence uses to decide whether to throw at all.
 * That is what makes a gap ball a DOUBLE: the outfielder has the ball and still
 * cannot do anything with it.
 */
function ballSecTo(s: PlayState, base: 1 | 2 | 3 | 4): number {
  if (s.throw) {
    if (s.throw.target.kind === 'base' && s.throw.target.base === base) {
      return Math.max(0, s.throw.arrivesAtSec - s.elapsedSec);
    }
    // In the air to somewhere else: whoever takes it has to throw again.
    const at = s.throw.target.kind === 'base' ? basePos(s.throw.target.base) : s.throw.target.at;
    return (
      Math.max(0, s.throw.arrivesAtSec - s.elapsedSec) +
      DEFENSE.RELEASE_SEC +
      throwOrRelaySec(s, at, base, 5)
    );
  }
  if (s.heldBy !== null) {
    const c = s.fielders[s.heldBy];
    const releaseLeft = Math.max(0, s.heldAtSec + DEFENSE.RELEASE_SEC - s.elapsedSec);
    return releaseLeft + throwOrRelaySec(s, c.p, base, c.arm);
  }
  // Loose. Somebody has to reach it first.
  const ch = s.fielders[s.active];
  const at =
    s.ballPhase === 'atRest' ? { x: s.ball.p.x, z: s.ball.p.z } : s.trace.settle;
  const gap = Math.max(0, dist(ch.p, at) - reachFt());
  const get = sprintTimeForFt(gap, ch.topFts, ch.accelFtS2, ch.speedFts);
  return get + DEFENSE.RELEASE_SEC + throwOrRelaySec(s, at, base, ch.arm);
}

/** A direct throw if the arm reaches, otherwise one through a cutoff man. */
function throwOrRelaySec(s: PlayState, from: Vec2, base: 1 | 2 | 3 | 4, arm: number): number {
  const bag = basePos(base);
  const direct = throwFlightSec(from, bag, arm);
  if (direct !== null) return direct;
  const cut = pickCutoff(s, from, base, arm);
  if (cut === null) return Infinity;
  const mate = s.fielders[cut];
  const l1 = throwFlightSec(from, mate.p, arm);
  const l2 = throwFlightSec(mate.p, bag, mate.arm);
  if (l1 === null || l2 === null) return Infinity;
  return l1 + DEFENSE.RELEASE_SEC + l2;
}

/** The bag the lead runner is heading for — where the ball wants to go. */
function leadRunnerTarget(s: PlayState): 1 | 2 | 3 | 4 | null {
  let best: 1 | 2 | 3 | 4 | null = null;
  for (const r of s.runners) {
    if (r.done !== null || isSettled(r)) continue;
    if (r.to < 1 || r.to > 4) continue;
    const base = r.to as 1 | 2 | 3 | 4;
    if (best === null || base > best) best = base;
  }
  return best;
}

/**
 * A throw lands.
 *
 * ★ THE `kind: 'fielder'` BRANCH RETURNS BEFORE THE RUNNER LOOP. Nobody can be
 * put out on a throw to a teammate, and v1 is emphatic about this: "That return
 * is the whole safety argument for the mechanic; do not restructure it away."
 */
function arriveThrow(s: PlayState): boolean {
  const th = s.throw!;
  s.throw = null;

  if (th.target.kind === 'fielder') {
    const receiver = s.fielders[th.target.idx];
    if (isFrozen(receiver, s.elapsedSec) || dist(receiver.p, th.target.at) > reachFt()) {
      // The cutoff man moved off the spot the throw was aimed at. Live ball.
      loosenAt(s, th.target.at);
      return true;
    }
    secureBall(s, th.target.idx);
    return false;
  }

  const bag = basePos(th.target.base);
  const idx = receiverAt(s, bag);
  if (idx === null) {
    // Nobody covering: the throw skips past the bag and the ball is live. This
    // is an overthrow, and it is EARNED — v1 instead snaps a fielder onto the
    // bag from up to 46ft away, which is a teleport wearing a radius.
    loosenAt(s, bag);
    return true;
  }
  secureBall(s, idx);

  for (const r of s.runners) {
    if (halfHasThreeOuts(s)) break;
    if (r.done !== null || isSettled(r)) continue;
    if (r.to !== th.target.base) continue;
    if (!isForced(s, r)) continue; // an unforced runner must be TAGGED
    r.done = 'out';
    recordOut(s, th.target.base, r.charId);
  }
  return false;
}

/** Whoever is standing at the bag and able to take it. */
function receiverAt(s: PlayState, bag: Vec2): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (let i = 0; i < s.fielders.length; i++) {
    const f = s.fielders[i];
    if (isFrozen(f, s.elapsedSec)) continue;
    const d = dist(f.p, bag);
    if (d <= reachFt() && d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Put a live ball on the ground at `p`, clamped and re-elected. */
function loosenAt(s: PlayState, p: Vec2): void {
  s.ball.p.x = p.x;
  s.ball.p.z = p.z;
  s.ball.p.y = 0;
  s.ball.v = { x: 0, y: 0, z: 0 };
  s.ball.w = { x: 0, y: 0, z: 0 };
  s.ball = settleBallAt(s.ball, s.geo);
  s.ballPhase = 'atRest';
  s.heldBy = null;
  for (const f of s.fielders) f.hasBall = false;
}

// --- Runners ----------------------------------------------------------------

function moveRunners(s: PlayState, dtSec: number): void {
  for (const r of s.runners) {
    if (r.done !== null) continue;
    const step = stepRunner(r, dtSec, s.elapsedSec);
    if (step !== 'arrived') continue;
    if (r.done === 'scored') {
      s.runs += 1;
      s.events.push({ t: 'score', runner: r.charId });
    } else {
      const at = Math.max(1, Math.min(3, r.from)) as 1 | 2 | 3;
      s.events.push({ t: 'safe', base: at, runner: r.charId });
      maybeRoundBag(s, r);
    }
  }
}

/**
 * Is this runner standing on a bag (untaggable) rather than between them?
 *
 * ★ ASKED OF THE RUNNER'S OWN LEG, never "near any base coordinate" — v1's
 * comment: "home is both base 0 and base 4, so a blanket scan let a runner
 * steaming toward the plate count as sheltered before they'd touched it". In v2
 * this needs no radius at all, because a leg-parameterised runner either has
 * `to === from` or does not.
 */
function onABag(r: RunnerState): boolean {
  return isSettled(r) && r.from >= 1 && r.from <= 3;
}

/** Standard force chain: forced iff every base behind, down to the plate, is taken. */
function isForced(s: PlayState, r: RunnerState): boolean {
  if (r.from === 0) return true;
  const occupied = new Set<number>();
  for (const o of s.runners) {
    if (o === r || o.done !== null) continue;
    occupied.add(o.from);
  }
  for (let b = 0; b < r.from; b++) if (!occupied.has(b)) return false;
  return true;
}

/**
 * The carrier jogging onto a bag is the same as a throw beating a runner there;
 * the carrier reaching an off-bag runner is a tag.
 *
 * ★ THE TAG IS `reachFt()`, NOT A CONSTANT OF ITS OWN. v1's `RUN2.TAG_RADIUS` is
 * 26px = 8.7ft, a tag from nine feet away, and it exists as a separate number
 * only because v1 had no single place for "how far a kid can reach". This one
 * rule is also what makes rundowns happen with no special-case state.
 */
function carrierTouchesBags(s: PlayState): void {
  if (s.heldBy === null) return;
  const carrier = s.fielders[s.heldBy];
  for (const base of [1, 2, 3, 4] as const) {
    if (halfHasThreeOuts(s)) return;
    if (dist(carrier.p, basePos(base)) > reachFt()) continue;
    for (const r of s.runners) {
      if (halfHasThreeOuts(s)) return;
      if (r.done !== null || isSettled(r) || r.to !== base) continue;
      if (!isForced(s, r)) continue;
      r.done = 'out';
      recordOut(s, base, r.charId);
    }
  }
  for (const r of s.runners) {
    if (halfHasThreeOuts(s)) return;
    if (r.done !== null || onABag(r)) continue;
    if (dist(carrier.p, runnerPos(r)) > reachFt()) continue;
    r.done = 'out';
    recordOut(s, Math.max(1, Math.min(4, r.to)) as 1 | 2 | 3 | 4, r.charId);
  }
}

/**
 * CPU baserunning.
 *
 * Lead runner first, so nobody piles into a base a teammate is claiming —
 * `startLeg` refuses an occupied bag, and asking in the wrong order means the
 * trailing runner holds when the lead one was about to vacate.
 */
function decideRunning(s: PlayState): void {
  if (s.flyCaught || s.homeRun) return;
  const loose = s.heldBy === null && !s.throw;
  const landed = !isCatchableFly(s);
  // Nobody has picked it up in forever? Kids notice. Everybody goes. (v1's
  // `CPU_RUNNER_PATIENCE_MS`, which exists so a play cannot stall with a live
  // ball on the grass and nine kids politely waiting.)
  const unattended =
    loose && s.landedAtSec !== null && s.elapsedSec - s.landedAtSec > PLAY.RUNNER_PATIENCE_SEC;

  const settled = s.runners
    .filter((r) => r.done === null && isSettled(r) && r.from > 0)
    .sort((a, b) => b.from - a.from);

  for (const r of settled) {
    if (!mayBeSent(r, s.elapsedSec)) continue;
    const next = Math.min(4, r.from + 1) as Base;
    if (isForced(s, r) && landed) {
      send(s, r, next);
      continue;
    }
    if (!landed) continue;
    if (unattended || worthTaking(s, r, next)) send(s, r, next);
  }
}

/**
 * Send them, and say so. Every leg in the sim begins here.
 *
 * ★ THE OCCUPANCY CHECK LIVES AT THIS LEVEL, not in `runners.ts`, and that is
 * the layering rather than an accident: `startLeg` is handed ONE runner and
 * cannot see the traffic. v1 puts the same guard in its own `startLeg` because
 * its runners live in the reducer — "Start a runner's next leg if the base ahead
 * is genuinely open", covering both "someone is running there" and "someone is
 * standing there".
 *
 * Leaving it out does not look like a baserunning bug. It looks like a runner
 * VANISHING: two kids settle on second, `finishPlay` writes one `baseIds` entry,
 * and the fold into the inning is handed a play that started with two runners
 * and returned one. Caught by the accounting sweep, which is the only thing that
 * could have caught it.
 */
function send(s: PlayState, r: RunnerState, to: Base): void {
  if (!baseIsOpen(s, r, to)) return;
  if (startLeg(r, to)) s.events.push({ t: 'run', runner: r.charId });
}

/** Is `to` genuinely free — nobody standing on it, nobody claiming it? */
function baseIsOpen(s: PlayState, r: RunnerState, to: Base): boolean {
  if (to >= 4) return true; // home takes everybody
  for (const o of s.runners) {
    if (o === r || o.done !== null) continue;
    if (o.to === to) return false; // running there, or settled on it
  }
  return true;
}

/**
 * Would this runner beat the ball to the next bag?
 *
 * Asked from a standing start, with the same margin the defence uses when it
 * decides whether to throw — so the two sides of the race are measured the same
 * way and a runner cannot be sent into an out the defence could see coming.
 */
function worthTaking(s: PlayState, r: RunnerState, next: Base): boolean {
  const legFt = dist(basePos(r.from), basePos(next));
  const mine = sprintTimeForFt(legFt, r.topFts, r.accelFtS2);
  return mine + PLAY.THROW_MARGIN_SEC < ballSecTo(s, next as 1 | 2 | 3 | 4);
}

/**
 * ★ ROUNDING THE BAG. A runner who touches a base with the ball still out of
 * play keeps going, and this is the ONLY place a leg starts without the dwell —
 * because the dwell models a decision made standing on a bag, and this decision
 * is made at full speed several strides before reaching it.
 *
 * Without it every ball in the gap is a single: the batter reaches first at
 * 4.2s, the outfielder has the ball 190ft away by then, and a runner who has to
 * come to a stop and think has already given up the base he was going to take.
 * `runners.ts` keeps momentum through a bag precisely so this can exist.
 */
function maybeRoundBag(s: PlayState, r: RunnerState): void {
  if (s.flyCaught || s.homeRun || r.done !== null || r.from < 1 || r.from >= 3) return;
  const next = (r.from + 1) as Base;
  if (worthTaking(s, r, next) && baseIsOpen(s, r, next)) send(s, r, next);
}

// --- Termination ------------------------------------------------------------

function checkTermination(s: PlayState): void {
  if (s.phase === 'done') return;

  if (halfHasThreeOuts(s)) return endPlay(s);

  if (s.homeRun) {
    // Everybody trots. The ball is not coming back.
    for (const r of s.runners) {
      if (r.done !== null) continue;
      r.done = 'scored';
      s.runs += 1;
      s.events.push({ t: 'score', runner: r.charId });
    }
    s.events.push({ t: 'homeRun' });
    return endPlay(s);
  }

  if (s.elapsedSec >= PLAY.MAX_PLAY_SEC) {
    // Never stall: stragglers settle safely on the base behind them. The rule
    // lives in `runners.ts` (`settleBase` uses min(from, to), not from) because
    // that is where v1's bug was.
    for (const r of s.runners) if (r.done === null) settleRunner(r);
    return endPlay(s);
  }

  // ★ A batter still standing at the plate is NOT settled: ending here would
  // record no base and no out for them, and they would vanish from the inning.
  //
  // ★ AND THERE IS NO DWELL HERE, which was a real decision rather than an
  // omission. An earlier version required every runner to have stood on their
  // bag for `RUN.BASE_DWELL_SEC` before the play could end, because ending on
  // the tick a runner arrived made every ball in the gap a single. That is a
  // true problem with the wrong fix: the decision to take another base is made
  // at full speed several strides out, not standing on the bag, and
  // `maybeRoundBag` is where it belongs. Once it moved there the dwell guard
  // stopped changing any outcome — verified by deleting it — so it is deleted.
  // A guard that no test can distinguish from its absence is the thing this
  // project keeps finding in v1.
  const everyoneSettled = s.runners.every((r) => r.done !== null || (isSettled(r) && r.from > 0));
  if (everyoneSettled && s.heldBy !== null) endPlay(s);
}

function endPlay(s: PlayState): void {
  s.phase = 'done';
  s.events.push({ t: 'playOver' });
}

// --- The outcome ------------------------------------------------------------

export function finishPlay(s: PlayState): PlayOutcome {
  const bases: [boolean, boolean, boolean] = [false, false, false];
  const baseIds: [string | null, string | null, string | null] = [null, null, null];
  for (const r of s.runners) {
    if (r.done === 'out' || r.done === 'scored') continue;
    // Belt-and-braces, the same one v1 carries: a live runner still at base 0
    // would be reported on no base and not out, and the fold into the inning
    // would silently DELETE them. Nothing should reach here at 0; if anything
    // does, the batter reached first rather than evaporating.
    const at = r.from <= 0 ? 1 : r.from;
    if (at >= 1 && at <= 3) {
      bases[at - 1] = true;
      baseIds[at - 1] = r.charId;
    }
  }
  const batter = s.runners[s.runners.length - 1];
  return {
    outs: s.outs,
    runs: s.runs,
    bases,
    baseIds,
    batterOut: batter.done === 'out',
    flyCaught: s.flyCaught,
    description: describePlay(s),
  };
}

function describePlay(s: PlayState): string {
  const head = s.homeRun
    ? 'HOME RUN!'
    : s.outs >= 2
      ? 'DOUBLE PLAY!'
      : s.flyCaught
        ? 'CAUGHT IT!'
        : s.outs === 1
          ? 'OUT!'
          : 'SAFE!';
  return s.runs > 0 ? `${head}\n+${s.runs} RUN${s.runs > 1 ? 'S' : ''}!` : head;
}
