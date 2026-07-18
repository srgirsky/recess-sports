// ---------------------------------------------------------------------------
// The live-play sim. PURE — no Phaser. A batted ball becomes a little
// real-time race: the ball flies/rolls, one fielder chases it (steered by the
// player's pointer on defense, by a CPU policy on offense), runners leg it
// around the bases, and throws race runners to bags. Outs EMERGE here instead
// of being pre-rolled.
//
// The scene calls stepLivePlay() every frame with the player's inputs and
// renders whatever the state says — it never decides an outcome. The playground
// rule set is deliberately simple for ages 4-8:
//   - catch a fly before it lands  -> batter's out, runners walk back free
//   - ball reaches a base before a runner running there -> that runner's out
//   - a runner standing safe on a base can never be put out
// ---------------------------------------------------------------------------

import { LIVE, ERRORS, RUN2 } from '../config';
import type { Launch } from './atbat';
import type { LiveParams } from './mode';
import {
  HOME,
  FIELD_POSITIONS,
  BASE_COVER,
  basePos,
  dist,
  lerpVec,
  moveToward,
  type PositionId,
  type Vec,
} from './geometry';

/** 0 = at the plate (the batter), 1-3 = the bases, 4 = home / scored. */
export type Base = 0 | 1 | 2 | 3 | 4;

export interface FielderState {
  position: PositionId;
  charId: string;
  pos: Vec;
  /** The spot this fielder returns to / stands at. */
  home: Vec;
  hasBall: boolean;
  /** This kid's stats: chase speed, glove (drop resistance), arm (wild resistance). */
  speed: number;
  glove: number;
  arm: number;
  /** After a drop/bobble the kid is flustered until this `elapsed` time. */
  fumbleUntil: number;
}

export interface RunnerState {
  charId: string;
  isBatter: boolean;
  /** Base occupied when the play began (0 for the batter). */
  startBase: Base;
  /** Last base safely touched. Settled when `to === from`. */
  from: Base;
  to: Base;
  /** 0..1 along the from→to leg. */
  progress: number;
  /** ms for the current leg (set when a leg starts). */
  legMs: number;
  /** px/s. */
  speed: number;
  pos: Vec;
  /** Kid mode: walking back to startBase after a caught fly — can't be put out. */
  returning: boolean;
  /**
   * Main mode: retreating to startBase after a caught fly (a real tag-up —
   * CAN be doubled off). Retreat legs run with `to < from`. Cleared on touch.
   */
  tagging?: boolean;
  /** Main mode: take off the moment the tag-up completes (a queued sac-fly send). */
  goAfterTag?: boolean;
  done: 'safe' | 'out' | 'scored' | null;
}

export interface BallState {
  /** Ground-plane (shadow) position. */
  pos: Vec;
  /** 0..1 arc height cue for the renderer (0 on the ground). */
  height: number;
  phase: 'flight' | 'rolling' | 'held' | 'thrown';
  heldBy: number | null; // fielder index
  /** Flight (off the bat): elapsed/total ms. */
  flightT: number;
  flightMs: number;
  /** Rolling: current speed + fixed deceleration reference. */
  rollV: number;
  rollTotal: number;
  /** A live throw. `wild` = it will sail past the bag (rolled at launch). */
  throw?: { toBase: 1 | 2 | 3 | 4; from: Vec; t: number; totalMs: number; wild?: boolean };
}

export type LivePhase = 'live' | 'done';

export type LiveEvent =
  | { t: 'catch'; fielder: string }
  | { t: 'pickup'; fielder: string }
  | { t: 'land' }
  | { t: 'error'; kind: 'drop' | 'bobble' | 'wild'; fielder: string }
  | { t: 'throw'; toBase: 1 | 2 | 3 | 4 }
  | { t: 'out'; base: 1 | 2 | 3 | 4; runner: string }
  | { t: 'safe'; base: 1 | 2 | 3 | 4; runner: string }
  | { t: 'score'; runner: string }
  | { t: 'run'; runner: string }
  | { t: 'playOver' };

export interface LivePlayState {
  /** Which side the HUMAN plays: 'defense' = fielding, 'offense' = running. */
  mode: 'defense' | 'offense';
  phase: LivePhase;
  launch: Launch;
  ball: BallState;
  fielders: FielderState[];
  /** Index of the chasing fielder (player-steered or CPU-driven). */
  active: number;
  runners: RunnerState[];
  outsBefore: number;
  outs: number;
  runs: number;
  flyCaught: boolean;
  elapsed: number;
  /** elapsed value when the ball was last secured (for throw-delay timers). */
  heldAt: number;
  /** elapsed value when the ball reached the ground (0 for grounders). */
  landedAt: number;
  /** elapsed value when a fly was caught (0 if none) — opens the sac-fly window. */
  catchAt: number;
  /** Events emitted THIS tick — the scene drains them for SFX/juice. */
  events: LiveEvent[];
}

export interface LiveInputs {
  /** Defense: where the kid wants the chasing fielder to go. */
  pointer?: Vec;
  /** Defense: a released throw (power 0..1 from the hold meter). */
  throwTo?: { base: 1 | 2 | 3 | 4; power: number };
  /** Offense (kid mode): "everybody GO!" tap. */
  run?: boolean;
  /** Offense (main mode): send this settled/tagging runner to the next base. */
  sendRunner?: string;
  /** Offense (main mode): turn this mid-leg runner back to the base behind. */
  holdRunner?: string;
}

export interface LiveOutcome {
  outs: number;
  runs: number;
  bases: [boolean, boolean, boolean];
  baseIds: [string | null, string | null, string | null];
  batterOut: boolean;
  flyCaught: boolean;
  description: string;
}

// --- Setup -----------------------------------------------------------------

export function startLivePlay(opts: {
  mode: 'defense' | 'offense';
  launch: Launch;
  batter: { charId: string; speed: number };
  baseRunners: Array<{ base: 1 | 2 | 3; charId: string; speed: number }>;
  /** Stats default to 5 for callers (tests) that don't care. */
  defense: Array<{ position: PositionId; charId: string; speed?: number; glove?: number; arm?: number }>;
  outs: number;
  params: LiveParams;
}): LivePlayState {
  const { mode, launch, params } = opts;
  const runSpeedBase = mode === 'offense' ? params.playerRunSpeed : params.cpuRunSpeed;

  const runners: RunnerState[] = [
    ...opts.baseRunners.map((r) => makeRunner(r.charId, r.base, r.speed, runSpeedBase, false)),
    makeRunner(opts.batter.charId, 0, opts.batter.speed, runSpeedBase, true),
  ];

  const fielders: FielderState[] = opts.defense.map((d) => ({
    position: d.position,
    charId: d.charId,
    pos: { ...FIELD_POSITIONS[d.position] },
    home: { ...FIELD_POSITIONS[d.position] },
    hasBall: false,
    speed: d.speed ?? 5,
    glove: d.glove ?? 5,
    arm: d.arm ?? 5,
    fumbleUntil: 0,
  }));

  // The chaser: whoever starts nearest the ball's landing/settle point.
  let active = 0;
  let best = Infinity;
  fielders.forEach((f, i) => {
    const d = dist(f.pos, launch.landing);
    if (d < best) {
      best = d;
      active = i;
    }
  });

  const s: LivePlayState = {
    mode,
    phase: 'live',
    launch,
    ball: {
      pos: { ...HOME },
      height: 0,
      phase: launch.hangMs > 0 ? 'flight' : 'rolling',
      heldBy: null,
      flightT: 0,
      flightMs: launch.hangMs,
      rollV: launch.hangMs > 0 ? 0 : launch.rollSpeed,
      rollTotal: launch.hangMs > 0 ? 1 : Math.max(1, dist(HOME, launch.landing)),
    },
    fielders,
    active,
    runners,
    outsBefore: opts.outs,
    outs: 0,
    runs: 0,
    flyCaught: false,
    elapsed: 0,
    heldAt: 0,
    landedAt: 0,
    catchAt: 0,
    events: [],
  };

  // The batter always runs. Forced runners must run too — on offense right
  // away (a caught fly returns them for free, so there's no downside); the
  // CPU's runners wait on flies like real kids and go once it lands.
  for (const r of s.runners) {
    if (r.isBatter || (isForced(s, r) && (mode === 'offense' || launch.type === 'grounder'))) {
      startLeg(s, r);
    }
  }
  return s;
}

function makeRunner(
  charId: string,
  base: Base,
  speedStat: number,
  baseSpeed: number,
  isBatter: boolean
): RunnerState {
  return {
    charId,
    isBatter,
    startBase: base,
    from: base,
    to: base,
    progress: 0,
    legMs: 0,
    speed: baseSpeed * (1 + (speedStat - 5) * 0.06),
    pos: { ...basePos(base) },
    returning: false,
    done: null,
  };
}

// --- The tick --------------------------------------------------------------

/**
 * Advance the sim by dtMs. Player inputs come in via `inputs`; the CPU side of
 * the play (fielding on offense, running on defense) is decided internally.
 * Mutates and returns `s` — callers treat the return value as THE state.
 */
export function stepLivePlay(
  s: LivePlayState,
  inputs: LiveInputs,
  dtMs: number,
  params: LiveParams,
  rng: () => number
): LivePlayState {
  s.events = [];
  if (s.phase === 'done' || dtMs <= 0) return s;
  s.elapsed += dtMs;

  moveBall(s, dtMs, params);
  moveFielders(s, inputs, params, dtMs);
  tryGrabBall(s, params, rng);
  maybeThrow(s, inputs, params, rng);
  moveRunners(s, dtMs);
  carrierTouchesBags(s, params);
  decideRunning(s, inputs, params);
  checkTermination(s, params);
  return s;
}

function moveBall(s: LivePlayState, dtMs: number, params: LiveParams): void {
  const b = s.ball;
  if (b.phase === 'flight') {
    b.flightT += dtMs;
    const t = Math.min(1, b.flightT / b.flightMs);
    b.pos = lerpVec(HOME, s.launch.landing, t);
    b.height = Math.sin(Math.PI * t);
    if (t >= 1) {
      // Dropped in. It sits where it landed (no bounce — this is kickball rules).
      b.phase = 'rolling';
      b.height = 0;
      b.rollV = 0;
      b.rollTotal = 1;
      s.landedAt = s.elapsed;
      s.events.push({ t: 'land' });
    }
  } else if (b.phase === 'rolling' && b.rollV > 0) {
    const remain = dist(b.pos, s.launch.landing);
    if (remain < 3) {
      b.pos = { ...s.launch.landing };
      b.rollV = 0;
    } else {
      // Decelerate toward the settle point (never fully crawls — snaps at 3px).
      const v = s.launch.rollSpeed * Math.max(0.15, remain / b.rollTotal);
      b.rollV = v;
      b.pos = moveToward(b.pos, s.launch.landing, (v * dtMs) / 1000);
    }
  } else if (b.phase === 'thrown' && b.throw) {
    b.throw.t += dtMs;
    const t = Math.min(1, b.throw.t / b.throw.totalMs);
    const target = basePos(b.throw.toBase);
    b.pos = lerpVec(b.throw.from, target, t);
    b.height = Math.sin(Math.PI * t) * 0.5;
    if (t >= 1) arriveThrow(s, b.throw.toBase, params);
  }
}

function moveFielders(
  s: LivePlayState,
  inputs: LiveInputs,
  params: LiveParams,
  dtMs: number
): void {
  const chaser = s.fielders[s.active];
  const ballBusy = s.ball.phase === 'flight' || s.ball.phase === 'rolling';

  if (s.mode === 'defense') {
    // Steerable while chasing AND while holding — a kid can run the ball to a bag.
    if (inputs.pointer) {
      chaser.pos = moveToward(
        chaser.pos,
        inputs.pointer,
        (params.fielderSpeed * statSpeedMult(chaser) * dtMs) / 1000
      );
      if (chaser.hasBall) s.ball.pos = { ...chaser.pos };
    }
  } else if (ballBusy && s.elapsed >= params.cpuReactionMs) {
    // CPU runs to the landing spot while the ball is up ("read it off the
    // bat"), then charges the ball itself once it's on the ground.
    const target = s.ball.phase === 'flight' ? s.launch.landing : s.ball.pos;
    chaser.pos = moveToward(
      chaser.pos,
      target,
      (params.cpuFielderSpeed * statSpeedMult(chaser) * dtMs) / 1000
    );
  }

  // Main mode: a CPU carrier with nobody worth throwing at hunts the nearest
  // off-bag runner for the tag — the defensive half of a rundown.
  if (
    s.mode === 'offense' &&
    params.manualBaserunning &&
    s.ball.phase === 'held' &&
    s.ball.heldBy !== null
  ) {
    const carrier = s.fielders[s.ball.heldBy];
    let target: RunnerState | null = null;
    let best = Infinity;
    for (const r of s.runners) {
      if (r.done !== null || onABag(r)) continue;
      const d = dist(carrier.pos, r.pos);
      if (d < best) {
        best = d;
        target = r;
      }
    }
    if (target) {
      carrier.pos = moveToward(
        carrier.pos,
        target.pos,
        (params.cpuFielderSpeed * statSpeedMult(carrier) * dtMs) / 1000
      );
      s.ball.pos = { ...carrier.pos };
    }
  }

  // The covering fielder jogs to the bag while a throw is in the air, so the
  // catch happens ON the base instead of the fielder teleporting there.
  if (s.ball.phase === 'thrown' && s.ball.throw) {
    const idx = s.fielders.findIndex((f) => f.position === BASE_COVER[s.ball.throw!.toBase]);
    if (idx >= 0 && idx !== s.active) {
      s.fielders[idx].pos = moveToward(
        s.fielders[idx].pos,
        basePos(s.ball.throw.toBase),
        (params.fielderSpeed * statSpeedMult(s.fielders[idx]) * dtMs) / 1000
      );
    }
  }
}

/** A fielder's chase speed factor from their speed stat (±5%/point around 5). */
function statSpeedMult(f: FielderState): number {
  return 1 + (f.speed - 5) * 0.05;
}

/** The error scale for the side currently on defense. */
function defErrorMult(s: LivePlayState, params: LiveParams): number {
  return s.mode === 'defense' ? params.playerErrorMult : params.cpuErrorMult;
}

/** Does this kid hang onto the ball? true = clean. Pure, exported for tests. */
export function rollCatch(glove: number, kind: 'fly' | 'grounder', mult: number, rng: () => number): boolean {
  if (mult <= 0) return true; // kid mode: no rng consumed, byte-identical sim
  const base = Math.max(0.01, ERRORS.DROP_BASE - (glove - 5) * ERRORS.PER_GLOVE);
  const chance = (kind === 'fly' ? base : base * ERRORS.BOBBLE_FACTOR) * mult;
  return rng() >= chance;
}

/** Does this throw sail past the bag? Pure, exported for tests. */
export function rollThrowError(arm: number, power: number, mult: number, rng: () => number): boolean {
  if (mult <= 0) return false;
  const overcharge = power >= 0.98 ? ERRORS.OVERCHARGE_PENALTY : 0;
  const chance = (Math.max(0.01, ERRORS.WILD_BASE - (arm - 5) * ERRORS.PER_ARM) + overcharge) * mult;
  return rng() < chance;
}

/** A muffed ball drops live at `pos`; the kid is flustered for a beat. */
function fumble(s: LivePlayState, fielder: FielderState, kind: 'drop' | 'bobble'): void {
  const b = s.ball;
  b.phase = 'rolling';
  b.height = 0;
  b.rollV = 0;
  b.rollTotal = 1;
  s.launch = { ...s.launch, landing: { ...b.pos } }; // it dies where it fell
  s.landedAt = s.elapsed;
  fielder.fumbleUntil = s.elapsed + ERRORS.FUMBLE_MS;
  s.events.push({ t: 'error', kind, fielder: fielder.charId });
}

function tryGrabBall(s: LivePlayState, params: LiveParams, rng: () => number): void {
  const b = s.ball;
  const chaser = s.fielders[s.active];
  if (s.elapsed < chaser.fumbleUntil) return; // still flustered from the muff
  const catchR = s.mode === 'defense' ? params.catchRadius : params.cpuCatchRadius;
  const pickupR = s.mode === 'defense' ? params.pickupRadius : params.cpuPickupRadius;

  if (b.phase === 'flight') {
    const t = b.flightT / b.flightMs;
    if (t >= 1 - LIVE.CATCHABLE_TAIL && dist(chaser.pos, b.pos) <= catchR) {
      if (!rollCatch(chaser.glove, 'fly', defErrorMult(s, params), rng)) {
        fumble(s, chaser, 'drop'); // clanked it — ball's live on the grass, nobody's out
        return;
      }
      secureBall(s, s.active);
      s.flyCaught = true;
      s.catchAt = s.elapsed;
      s.events.push({ t: 'catch', fielder: chaser.charId });
      const batter = s.runners.find((r) => r.isBatter)!;
      if (batter.done === null) {
        batter.done = 'out';
        s.outs += 1;
        s.events.push({ t: 'out', base: 1, runner: batter.charId });
      }
      for (const r of s.runners) {
        if (r.done !== null || r.isBatter) continue;
        if (params.manualBaserunning) {
          // Real tag-up rules: anyone off their base must get back — and can
          // be doubled off on the way. Touch it and you may be sent again.
          if (r.from !== r.startBase || r.to !== r.from) {
            r.tagging = true;
            if (r.to !== r.from) reverseLeg(r);
            else startRetreatLeg(r);
          }
        } else if (r.from !== r.startBase || r.to !== r.from) {
          // Kid mode: everyone strolls back for free — no doubling off.
          r.returning = true;
          r.to = r.startBase;
        }
      }
    }
  } else if (b.phase === 'rolling') {
    if (dist(chaser.pos, b.pos) <= pickupR) {
      if (!rollCatch(chaser.glove, 'grounder', defErrorMult(s, params), rng)) {
        fumble(s, chaser, 'bobble');
        return;
      }
      secureBall(s, s.active);
      s.events.push({ t: 'pickup', fielder: chaser.charId });
    }
  }
}

function secureBall(s: LivePlayState, fielderIdx: number): void {
  const b = s.ball;
  b.phase = 'held';
  b.height = 0;
  b.heldBy = fielderIdx;
  b.throw = undefined;
  b.pos = { ...s.fielders[fielderIdx].pos };
  s.fielders.forEach((f, i) => (f.hasBall = i === fielderIdx));
  s.heldAt = s.elapsed;
}

function maybeThrow(
  s: LivePlayState,
  inputs: LiveInputs,
  params: LiveParams,
  rng: () => number
): void {
  if (s.ball.phase !== 'held') return;
  const carrier = s.ball.heldBy !== null ? s.fielders[s.ball.heldBy] : undefined;
  const mult = defErrorMult(s, params);

  if (s.mode === 'defense') {
    if (inputs.throwTo) {
      const speed =
        params.throwSpeedMin + inputs.throwTo.power * (params.throwSpeedMax - params.throwSpeedMin);
      const wild = rollThrowError(carrier?.arm ?? 5, inputs.throwTo.power, mult, rng);
      launchThrow(s, inputs.throwTo.base, speed, 0, wild, carrier);
    } else if (s.elapsed - s.heldAt >= params.autoThrowMs && anyForwardMover(s)) {
      // Idle-kid rescue: the sim throws a decent (not perfect) ball by itself.
      const speed = params.throwSpeedMin + 0.75 * (params.throwSpeedMax - params.throwSpeedMin);
      launchThrow(s, chooseThrowTarget(s, speed), speed, 0, false, carrier);
    }
  } else if (
    s.elapsed - s.heldAt >=
      params.cpuThrowDelayMs +
        (params.manualBaserunning && s.flyCaught ? RUN2.CATCH_GATHER_MS : 0) &&
    anyForwardMover(s)
  ) {
    // Main mode: don't fling it when no throw can beat anyone — the carrier
    // keeps the ball and hunts the runner for a tag instead (see moveFielders).
    if (params.manualBaserunning && bestBeatableBase(s, params.cpuThrowSpeed) === null) return;
    const wild = rollThrowError(carrier?.arm ?? 5, 0.8, mult, rng);
    launchThrow(
      s,
      chooseThrowTarget(s, params.cpuThrowSpeed),
      params.cpuThrowSpeed,
      rng() * params.cpuThrowErrorMs,
      wild,
      carrier
    );
  }
}

function launchThrow(
  s: LivePlayState,
  toBase: 1 | 2 | 3 | 4,
  speed: number,
  extraMs: number,
  wild = false,
  thrower?: FielderState
): void {
  const b = s.ball;
  const from = { ...b.pos };
  const totalMs = (dist(from, basePos(toBase)) / speed) * 1000 + extraMs;
  b.phase = 'thrown';
  b.heldBy = null;
  b.throw = { toBase, from, t: 0, totalMs: Math.max(60, totalMs), wild };
  s.fielders.forEach((f) => (f.hasBall = false));
  s.events.push({ t: 'throw', toBase });
  if (wild && thrower) s.events.push({ t: 'error', kind: 'wild', fielder: thrower.charId });
}

/** Flip a mid-leg runner around (same leg, opposite direction). */
function reverseLeg(r: RunnerState): void {
  if (r.to === r.from) return;
  const { from } = r;
  r.from = r.to;
  r.to = from;
  r.progress = 1 - r.progress;
}

/** A settled runner steps back one base (tag-up retreat / manual hold). */
function startRetreatLeg(r: RunnerState): void {
  if (r.to !== r.from || r.from <= 0) return;
  const prev = (r.from - 1) as Base;
  r.to = prev;
  r.progress = 0;
  r.legMs = Math.max(1, (dist(basePos(r.from), basePos(prev)) / r.speed) * 1000);
}

/** Is this runner standing on a bag (untaggable) rather than between them? */
function onABag(r: RunnerState): boolean {
  for (const b of [0, 1, 2, 3, 4] as const) {
    if (dist(r.pos, basePos(b)) <= RUN2.SAFE_RADIUS) return true;
  }
  return false;
}

/**
 * Whether a ball arriving at `base` retires this runner. Kid mode: any runner
 * racing there. Main mode: only FORCED runners (real force-outs) and runners
 * retreating there (doubled off) — an unforced advance must be tagged.
 */
function outAtBag(s: LivePlayState, r: RunnerState, base: 1 | 2 | 3 | 4, params: LiveParams): boolean {
  if (r.done !== null || r.returning || r.to !== base || r.to === r.from || r.progress >= 1) return false;
  if (!params.manualBaserunning) return true;
  return isForced(s, r) || r.to < r.from;
}

/** The ball beat these runners to the bag — playground rules, they're out. */
function arriveThrow(s: LivePlayState, base: 1 | 2 | 3 | 4, params: LiveParams): void {
  // A wild throw sails past the bag and dies loose — nobody's out, take a base!
  if (s.ball.throw?.wild) {
    const b = s.ball;
    const from = b.throw!.from;
    const bag = basePos(base);
    const len = Math.max(1, dist(from, bag));
    const dir = { x: (bag.x - from.x) / len, y: (bag.y - from.y) / len };
    b.pos = { x: bag.x + dir.x * ERRORS.OVERSHOOT_PX, y: bag.y + dir.y * ERRORS.OVERSHOOT_PX };
    b.phase = 'rolling';
    b.height = 0;
    b.rollV = 0;
    b.rollTotal = 1;
    b.throw = undefined;
    s.launch = { ...s.launch, landing: { ...b.pos } };
    s.landedAt = s.elapsed;
    return;
  }
  for (const r of s.runners) {
    if (outAtBag(s, r, base, params)) {
      r.done = 'out';
      r.pos = { ...basePos(base) };
      s.outs += 1;
      s.events.push({ t: 'out', base, runner: r.charId });
    }
  }
  // The covering fielder takes it standing on the bag.
  const coverIdx = s.fielders.findIndex((f) => f.position === BASE_COVER[base]);
  const idx = coverIdx >= 0 ? coverIdx : s.active;
  s.fielders[idx].pos = { ...basePos(base) };
  secureBall(s, idx);
}

/** Carrier jogs onto a bag a runner is heading to → same as a throw beating them. */
function carrierTouchesBags(s: LivePlayState, params: LiveParams): void {
  const b = s.ball;
  if (b.phase !== 'held' || b.heldBy === null) return;
  const carrier = s.fielders[b.heldBy];
  const reach = s.mode === 'defense' ? params.pickupRadius : params.cpuPickupRadius;
  for (const base of [1, 2, 3, 4] as const) {
    if (dist(carrier.pos, basePos(base)) > reach) continue;
    for (const r of s.runners) {
      if (outAtBag(s, r, base, params)) {
        r.done = 'out';
        r.pos = { ...basePos(base) };
        s.outs += 1;
        s.events.push({ t: 'out', base, runner: r.charId });
      }
    }
  }
  // Main mode: carrying the ball to a runner caught between bags = tag out.
  // This one rule is what makes rundowns happen with no special-case state.
  if (params.manualBaserunning) {
    for (const r of s.runners) {
      if (r.done !== null || r.returning || onABag(r)) continue;
      if (dist(carrier.pos, r.pos) <= RUN2.TAG_RADIUS) {
        r.done = 'out';
        s.outs += 1;
        s.events.push({ t: 'out', base: Math.max(1, Math.min(4, r.to)) as 1 | 2 | 3 | 4, runner: r.charId });
      }
    }
  }
}

function moveRunners(s: LivePlayState, dtMs: number): void {
  for (const r of s.runners) {
    if (r.done !== null) continue;

    if (r.returning) {
      const target = basePos(r.startBase);
      r.pos = moveToward(r.pos, target, (r.speed * dtMs) / 1000);
      if (r.pos.x === target.x && r.pos.y === target.y) {
        r.returning = false;
        r.from = r.startBase;
        r.to = r.startBase;
        r.progress = 0;
      }
      continue;
    }

    if (r.to === r.from) {
      r.pos = { ...basePos(r.from) };
      continue;
    }

    r.progress = Math.min(1, r.progress + dtMs / r.legMs);
    r.pos = lerpVec(basePos(r.from), basePos(r.to), r.progress);
    if (r.progress >= 1) {
      r.from = r.to;
      r.progress = 0;
      if (r.tagging) {
        // Retreating after a caught fly: keep backing up until the start base
        // is touched; then the runner is live again (and may have a queued send).
        if (r.from === r.startBase) {
          r.tagging = false;
          s.events.push({ t: 'safe', base: Math.max(1, r.from) as 1 | 2 | 3, runner: r.charId });
          if (r.goAfterTag) {
            r.goAfterTag = false;
            startLeg(s, r);
          }
        } else {
          startRetreatLeg(r);
        }
      } else if (r.to >= 4) {
        r.done = 'scored';
        s.runs += 1;
        s.events.push({ t: 'score', runner: r.charId });
      } else {
        s.events.push({ t: 'safe', base: r.to as 1 | 2 | 3, runner: r.charId });
      }
    }
  }
}

function decideRunning(s: LivePlayState, inputs: LiveInputs, params: LiveParams): void {
  if (s.mode === 'offense') {
    if (params.manualBaserunning) {
      // Per-runner control. Sends work after a catch too — that's a sac fly.
      if (inputs.sendRunner) {
        const r = s.runners.find((o) => o.charId === inputs.sendRunner && o.done === null);
        if (r) {
          if (r.tagging) r.goAfterTag = true; // queued: go the moment the tag completes
          else startLeg(s, r);
        }
      }
      if (inputs.holdRunner) {
        const r = s.runners.find((o) => o.charId === inputs.holdRunner && o.done === null);
        if (r && r.to > r.from && r.progress < 1) reverseLeg(r);
      }
      return;
    }
    if (s.flyCaught) return; // kid mode: everyone's walking back — no more advancing
    if (!inputs.run) return;
    // Lead runner first so nobody piles into an occupied base.
    for (const r of leadFirst(settledRunners(s))) startLeg(s, r);
    return;
  }

  // --- CPU baserunning (the player is fielding) ----------------------------
  if (s.flyCaught) {
    if (!params.manualBaserunning) return;
    // Tag-up-and-go: after (or during) the tag, a deep enough ball is worth a
    // dash for the next bag — the sac fly emerges from this rule.
    for (const r of s.runners) {
      if (r.done !== null) continue;
      const next = Math.min(4, (r.tagging ? r.startBase : r.from) + 1) as 1 | 2 | 3 | 4;
      const deep = dist(s.ball.pos, basePos(next)) > LIVE.CPU_RUNNER_GREED_DIST;
      if (!deep) continue;
      if (r.tagging) r.goAfterTag = true;
      else if (r.to === r.from) startLeg(s, r);
    }
    return;
  }

  const ballLoose = s.ball.phase === 'flight' || s.ball.phase === 'rolling';
  const landed = s.ball.phase !== 'flight' && s.ball.phase !== 'thrown';
  // Nobody's picked it up in forever? Kids notice. Everybody goes.
  const unattended = ballLoose && landed && s.elapsed - s.landedAt > LIVE.CPU_RUNNER_PATIENCE_MS;
  for (const r of leadFirst(settledRunners(s))) {
    const next = (r.from + 1) as 1 | 2 | 3 | 4;
    // Forced runners take off once it's clearly not a catchable fly.
    if (isForced(s, r) && (s.launch.type === 'grounder' || landed)) {
      startLeg(s, r);
      continue;
    }
    // Greedy extra base while the ball is loose: it's far from the bag, or
    // it's just lying there unattended.
    if (ballLoose && landed && (unattended || dist(s.ball.pos, basePos(next)) > LIVE.CPU_RUNNER_GREED_DIST)) {
      startLeg(s, r);
    }
  }

  // Main mode: a CPU runner caught with the carrier ahead of them turns back
  // (which is what turns a botched advance into a real rundown).
  if (params.manualBaserunning && s.ball.phase === 'held' && s.ball.heldBy !== null) {
    const carrier = s.fielders[s.ball.heldBy];
    for (const r of s.runners) {
      if (r.done !== null || r.to === r.from || r.to < r.from || r.tagging) continue;
      const bag = basePos(r.to);
      const carrierAhead = dist(carrier.pos, bag) + 20 < dist(r.pos, bag);
      if (carrierAhead && dist(carrier.pos, r.pos) < RUN2.CPU_PANIC_DIST && r.progress < 0.8) {
        reverseLeg(r);
      }
    }
  }
}

/** Start a runner's next leg if the base ahead is genuinely open. */
function startLeg(s: LivePlayState, r: RunnerState): void {
  if (r.done !== null || r.returning || r.to !== r.from) return;
  const next = Math.min(4, r.from + 1) as 1 | 2 | 3 | 4;
  if (next !== 4) {
    // Occupied or already claimed by a teammate → hold.
    const taken = s.runners.some(
      (o) => o !== r && o.done === null && !o.returning && (o.to === next || (o.to === o.from && o.from === next))
    );
    if (taken) return;
  }
  r.to = next;
  r.progress = 0;
  r.legMs = Math.max(1, (dist(basePos(r.from), basePos(next)) / r.speed) * 1000);
  s.events.push({ t: 'run', runner: r.charId });
}

function checkTermination(s: LivePlayState, params: LiveParams): void {
  if (s.phase === 'done') return;

  if (s.outsBefore + s.outs >= 3) {
    endPlay(s);
    return;
  }

  if (s.elapsed >= params.maxPlayMs) {
    // Never stall: stragglers settle safely on the base behind them.
    for (const r of s.runners) {
      if (r.done !== null) continue;
      if (r.returning) {
        r.from = r.startBase;
      }
      r.to = r.from;
      r.progress = 0;
      r.pos = { ...basePos(r.from) };
      r.returning = false;
    }
    endPlay(s);
    return;
  }

  const everyoneSettled = s.runners.every(
    (r) => r.done !== null || (!r.returning && r.to === r.from)
  );
  if (everyoneSettled && s.ball.phase === 'held') {
    // Main mode: hold a caught fly open long enough to send a tagged-up
    // runner — otherwise the sac-fly window would slam shut instantly.
    if (
      params.manualBaserunning &&
      s.flyCaught &&
      s.mode === 'offense' &&
      s.elapsed - s.catchAt < RUN2.SAC_WINDOW_MS
    ) {
      return;
    }
    endPlay(s);
  }
}

function endPlay(s: LivePlayState): void {
  s.phase = 'done';
  s.events.push({ t: 'playOver' });
}

// --- Policies & helpers ----------------------------------------------------

/**
 * Where to throw: the highest base where the throw can still beat a runner;
 * if nobody's gettable, fire at the lead runner's target anyway (pressure).
 */
export function chooseThrowTarget(s: LivePlayState, throwSpeed: number): 1 | 2 | 3 | 4 {
  const movers = s.runners.filter(
    (r) => r.done === null && !r.returning && r.to !== r.from
  );
  if (movers.length === 0) return 1;
  const bestBase = bestBeatableBase(s, throwSpeed);
  if (bestBase !== null) return bestBase;
  const lead = leadFirst(movers)[0];
  return lead.to as 1 | 2 | 3 | 4;
}

/** The highest base where a throw would beat the runner racing to it (or null). */
function bestBeatableBase(s: LivePlayState, throwSpeed: number): 1 | 2 | 3 | 4 | null {
  let bestBase: 1 | 2 | 3 | 4 | null = null;
  for (const r of s.runners) {
    if (r.done !== null || r.returning || r.to === r.from) continue;
    const base = r.to as 1 | 2 | 3 | 4;
    const throwMs = (dist(s.ball.pos, basePos(base)) / throwSpeed) * 1000;
    const runnerMs = (1 - r.progress) * r.legMs;
    if (throwMs < runnerMs && (bestBase === null || base > bestBase)) bestBase = base;
  }
  return bestBase;
}

/** Standard force chain: forced iff every base behind (down to the plate) is occupied. */
function isForced(s: LivePlayState, r: RunnerState): boolean {
  if (r.isBatter) return r.from === 0;
  const occupied = new Set(
    s.runners.filter((o) => o.done === null && !o.returning).map((o) => o.from)
  );
  for (let b = 0; b < r.from; b++) {
    if (!occupied.has(b as Base)) return false;
  }
  return true;
}

function settledRunners(s: LivePlayState): RunnerState[] {
  return s.runners.filter(
    (r) => r.done === null && !r.returning && r.to === r.from && r.from < 4
  );
}

function leadFirst(runners: RunnerState[]): RunnerState[] {
  return [...runners].sort((a, b) => b.from - a.from);
}

function anyForwardMover(s: LivePlayState): boolean {
  return s.runners.some((r) => r.done === null && !r.returning && r.to !== r.from);
}

// --- Wrap-up ---------------------------------------------------------------

/** Summarize a finished play so the rules layer can fold it into the inning. */
export function finishLivePlay(s: LivePlayState): LiveOutcome {
  const bases: [boolean, boolean, boolean] = [false, false, false];
  const baseIds: [string | null, string | null, string | null] = [null, null, null];
  for (const r of s.runners) {
    if (r.done === 'out' || r.done === 'scored') continue;
    if (r.from >= 1 && r.from <= 3) {
      bases[r.from - 1] = true;
      baseIds[r.from - 1] = r.charId;
    }
  }
  const batter = s.runners.find((r) => r.isBatter)!;
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

function describePlay(s: LivePlayState): string {
  let line: string;
  if (s.outs >= 2) line = 'DOUBLE PLAY!';
  else if (s.flyCaught) line = 'CAUGHT IT!';
  else if (s.outs === 1) line = 'OUT!';
  else line = 'SAFE!';
  if (s.runs > 0) line += `\n+${s.runs} RUN${s.runs > 1 ? 'S' : ''}!`;
  return line;
}
