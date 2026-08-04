// ---------------------------------------------------------------------------
// A whole game, headless. PURE.
//
// ★ THIS IS WHERE THE FIVE SHARED `systems/` MODULES GET THEIR FIRST REAL USE,
// which `purity.lint.test.js` has been guarding for three PRs while nothing
// leaned on it: `inning`, `gameflow`, `stats`, `lineup` and `draft` were
// whitelisted as "verified shareable", and the whitelist's own test admits the
// fence "had never been leaned on". It is now. The count, the walk, the
// between-halves decision and the stat fold are v1's code, unmodified, running
// under v2's physics.
//
// ★ WHAT IS NOT RESTATED. v2 does not own a count — `inning.applyAtBat` does,
// including the rule that a foul is a strike but never the third and that the
// count resets on every batter-done branch. v2 does not own the extra-innings
// decision — `gameflow.decideAfterHalf` does. Re-implementing either would be
// two sources of truth for a rule nobody has any reason to change.
//
// ★ THREE SEAMS THAT BITE, each of which has a test:
//
//   1. `applyLivePlay` DROPS `baseIds` and resets the count. It reads only
//      `outs`, `runs`, `bases` and `batterOut`. So per-kid run attribution has
//      to be taken off the play's own events BEFORE folding, or every run in the
//      game becomes anonymous at the seam.
//   2. `decideAfterHalf(inning, half, regulation, awayScore, homeScore, …)`
//      takes AWAY THEN HOME, while `shouldSkipBottom` and `isWalkOff` in the
//      same file take HOME THEN AWAY. Reversed, three functions apart.
//   3. `lineupIdx` is advanced by the CALLER, not the reducer, and only when
//      `batterDone`. v1 does it at four separate sites.
// ---------------------------------------------------------------------------

import type { Character } from '../../data/types';
import { GAME, PLAY } from './params';
import { isStrike, pitchAndSwing, type PitchResult } from './atbat';
import { catcherOf, cpuWantsSteal, stealRace, type StealTarget } from './steal';
import type { BallState } from './flight';
import type { PitchKind } from './pitch';
import { flyToPlate, releasePitch } from './pitch';
import { resolvePlate, type PlateOverrides, type PlateParams } from './params';
import {
  beginPlay,
  finishPlay,
  stepPlay,
  type PlayInputs,
  type PlayOutcome,
  type PlayState,
} from './play';
import type { LaunchSpec } from './launch';
import { planDefence, type DefencePlan } from './lineup';
import { DEFAULT_GEOMETRY, type FieldGeometry, type PositionId } from './field';
import type { Rng } from './rng';

import { applyAtBat, applyLivePlay, applySteal, isHalfOver, newHalfInning } from '../../systems/inning';
import { decideAfterHalf, isWalkOff, shouldSkipBottom } from '../../systems/gameflow';
import { foldStats, type KidStats, type StatEvent } from '../../systems/stats';
import type { AtBatResult } from '../../systems/atbat';

export interface TeamSpec {
  name: string;
  /** Nine ids. `planDefence` decides where they stand and when they bat. */
  ids: string[];
}

/**
 * What a batted ball turned into, from the batter's point of view.
 *
 * `'out'` covers every way the defence retired him; the extra-base cases are
 * DERIVED from where he ended up rather than decided anywhere, which is the
 * same discipline `PlayOutcome` follows for everything else.
 */
export type HitType = 'out' | '1B' | '2B' | '3B' | 'HR';

/**
 * Everything the sim knows and then throws away.
 *
 * ★ WHY AN OBSERVER RATHER THAN A RETURN VALUE. `GameTally` is nine integers,
 * and every batted ball's launch angle, exit velocity, spray and spin is
 * computed, handed to the play, and dropped two lines later. The harness needs
 * all of it — but a `GameResult` carrying 32,000 batted balls would make every
 * caller pay for a measurement only one of them wants, and 50,000 plate
 * appearances of retained objects is a memory bill for nothing. A callback
 * streams them: the aggregator buckets each event and keeps none.
 *
 * It is also the shape `play.ts` already uses for `PlayEvent`, so there is one
 * idiom for "the sim is telling you what happened" rather than two.
 */
export type SimEvent =
  | {
      t: 'pitch';
      kind: PitchResult['kind'];
      /** Where it ACTUALLY crossed, per the umpire — not where it was aimed. */
      inZone: boolean;
      swung: boolean;
      balls: number;
      strikes: number;
    }
  | {
      t: 'contact';
      launch: LaunchSpec;
      hit: HitType;
      flyCaught: boolean;
      foul: boolean;
    };

/**
 * One resumable instant of a game.
 *
 * ★ WHY THE FLOW IS A GENERATOR. `simulateGame` is four nested synchronous
 * loops, and rendering live means the INNERMOST one is driven by the frame loop
 * — so the outer three have to become resumable. Writing a separate live driver
 * would be a SECOND IMPLEMENTATION of the game flow, which is exactly what
 * `bounce.ts`'s `stepLooseBall` note exists to prevent ("where is it going" and
 * "where did it go" are one implementation) and what would drift silently from
 * the 50,000-plate-appearance harness every record now rests on.
 *
 * So the flow yields and `simulateGame` drains it: one implementation, two
 * drivers, the way `layout.browser.js` serves both the dev overlay and the CI
 * audit. Measured before committing to it — a per-tick `yield` costs 9ns,
 * about 0.7% of the harness's real per-tick work.
 *
 * ★ THE FRAME IS A VIEW, NOT A COPY. `play` is the live `PlayState` itself, not
 * a clone: the render layer reads it within the tick and keeps nothing, and
 * cloning nine fielders and four runners sixty times a second to protect
 * against a caller that does not exist is a cost with no buyer. `bridge.ts` is
 * the only consumer and a lint holds it read-only.
 */
export interface LiveFrame {
  phase: 'pitch' | 'live' | 'between';
  inning: number;
  half: 'top' | 'bottom';
  outs: number;
  balls: number;
  strikes: number;
  awayScore: number;
  homeScore: number;
  bases: [boolean, boolean, boolean];
  /** The batter and the pitcher, for the view to pose. */
  batterId: string;
  pitcherId: string;
  /**
   * Who is fielding where.
   *
   * ★ THE FRAME CARRIES THIS BECAUSE THE DEFENCE EXISTS BETWEEN PITCHES TOO.
   * Without it the view can only draw whoever is in a live `PlayState`, so the
   * nine fielders vanish the moment a play ends and reappear on contact — which
   * is exactly what the first watch of `/v2/?play=1` showed: an empty park with
   * one enormous batter in it.
   */
  defence: Record<string, PositionId>;
  /** Live only: the play in progress. Null between pitches. */
  play: PlayState | null;
  /** On a `pitch` frame: the released ball and how long it flies. */
  pitch: { release: BallState; travelSec: number; kind: PitchKind } | null;
}

export interface GameSpec {
  away: TeamSpec;
  home: TeamSpec;
  lookup: (id: string) => Character;
  geo?: FieldGeometry;
  regulationInnings?: number;
  /**
   * Optional observer. Called synchronously as the game unfolds; nothing is
   * retained. `harness.ts` is its only consumer.
   */
  onEvent?: (e: SimEvent) => void;
  /**
   * Override the four coupled plate constants for this game.
   *
   * ★ FOR THE SWEEP, AND IT IS A SEAM RATHER THAN A FILE REWRITE. See
   * `params.ts`'s `PlateOverrides`: the alternative is a script that patches
   * `params.ts` per candidate, and PR 7's gate sweep did that and left two
   * injected values in the tree across two interrupted runs. Omitting the field
   * resolves to the shipped constants, so the default path is unchanged.
   */
  plate?: PlateOverrides;
}

export interface GameResult {
  awayScore: number;
  homeScore: number;
  /** Runs per half, `[[awayTop, homeBottom], …]`. A line score. */
  lineScore: Array<[number, number | null]>;
  innings: number;
  tie: boolean;
  walkOff: boolean;
  /** Per-kid, folded through v1's `stats.foldStats`. */
  lines: Record<string, KidStats>;
  /** What happened, in order. The demo prints it; nothing else reads it. */
  log: string[];
  tally: GameTally;
}

/** Counting stats for the whole game — what PR 8's harness will aggregate. */
export interface GameTally {
  plateAppearances: number;
  pitches: number;
  strikeouts: number;
  walks: number;
  fouls: number;
  stealAttempts: number;
  stealsSafe: number;
  ballsInPlay: number;
  hits: number;
  homeRuns: number;
  runs: number;
}

const EMPTY_TALLY = (): GameTally => ({
  plateAppearances: 0,
  pitches: 0,
  strikeouts: 0,
  walks: 0,
  fouls: 0,
  stealAttempts: 0,
  stealsSafe: 0,
  ballsInPlay: 0,
  hits: 0,
  homeRuns: 0,
  runs: 0,
});

interface Side {
  spec: TeamSpec;
  plan: DefencePlan;
  lineupIdx: number;
  score: number;
}

/**
 * Turn one pitch into the `AtBatResult` v1's count machine understands.
 *
 * ★ THE TYPE IS IMPORTED, THE MODULE IS NOT. `systems/atbat.ts` is px/s
 * throughout and is not on the pure whitelist, so a value import is a lint
 * failure; the type erases at build and carries nothing. This is the type-only
 * lane doing exactly what it was built for.
 */
function asAtBatResult(r: PitchResult): AtBatResult | null {
  switch (r.kind) {
    case 'ball':
      return { kind: 'ball', bases: 0, description: 'Ball!' };
    case 'calledStrike':
      return { kind: 'strike', bases: 0, description: 'Strike! Looking!' };
    case 'swingingStrike':
      return { kind: 'strike', bases: 0, description: 'Swing and a miss!' };
    case 'foulTip':
      return { kind: 'foul', bases: 0, description: 'Ticked it foul.' };
    case 'inPlay':
      return null; // the play decides
  }
}

/**
 * One plate appearance, pitch by pitch.
 *
 * Returns when `inning.applyAtBat` (or the play) says the batter is done. The
 * count lives in `HalfInningState` and nothing here duplicates it.
 */
function* playAtBatLive(
  args: {
    batter: Character;
    pitcher: Character;
    defence: Record<string, PositionId>;
    lookup: (id: string) => Character;
    geo: FieldGeometry;
    half: HalfState;
    tally: GameTally;
    stats: StatEvent[];
    log: string[];
    onEvent?: (e: SimEvent) => void;
    plate?: PlateParams;
    frame: LiveFrame;
  },
  rng: Rng
): Generator<LiveFrame, void, PlayInputs> {
  const { half, tally, stats, log, onEvent, frame } = args;
  let pitches = 0;
  frame.batterId = args.batter.id;
  frame.pitcherId = args.pitcher.id;
  frame.defence = args.defence;

  for (;;) {
    if (pitches++ >= GAME.MAX_PITCHES_PER_PA) {
      // ★ A CAP THAT FIRES IS A BUG THAT WAS CAUGHT, not a rule — same
      // discipline as `PLAY.MAX_PLAY_SEC`. No real plate appearance runs this
      // long; if one does, the count is not advancing and a test says so.
      throw new Error(`plate appearance exceeded ${GAME.MAX_PITCHES_PER_PA} pitches`);
    }
    tally.pitches += 1;
    syncFrame(frame, half, 'pitch');
    frame.play = null;
    const result = pitchAndSwing(
      { pitcher: args.pitcher, batter: args.batter, count: half.state.count, plate: args.plate },
      rng.fork(`p${pitches}`)
    );
    frame.pitch = { release: result.release, travelSec: result.travelSec, kind: result.pitch };
    yield frame;

    // ★ THE COUNT IS READ BEFORE THE FOLD. `applyAtBat` resets it to 0-0 on
    // every batter-done branch, so an observer told afterwards would see every
    // strikeout arrive on an 0-0 count.
    // ★ THE STEAL DECISION IS MADE BEFORE THE PITCH AND RESOLVED AFTER IT, and
    // the two use DIFFERENT flight times on purpose. A baserunner commits
    // without knowing what is coming, so he projects against the pitcher's
    // FASTBALL — his own worst case. The race then runs on what was actually
    // thrown, which is how a changeup becomes a gift rather than an assumption:
    // `sim.stealRace` measures the same runner out by 0.18s on a fastball and
    // safe by 0.13s on a changeup, with nothing anywhere saying so.
    const steal = tryStealBefore(half, args, result.travelSec, rng.fork(`steal${pitches}`));
    if (steal) {
      tally.stealAttempts += 1;
      if (steal.safe) tally.stealsSafe += 1;
      log.push(steal.line);
    }

    const before = { balls: half.state.count.balls, strikes: half.state.count.strikes };
    const swung =
      result.kind === 'swingingStrike' || result.kind === 'foulTip' || result.kind === 'inPlay';
    onEvent?.({
      t: 'pitch',
      kind: result.kind,
      inZone: isStrike(result.crossing),
      swung,
      balls: before.balls,
      strikes: before.strikes,
    });

    if (result.kind !== 'inPlay') {
      const folded = applyAtBat(half.state, asAtBatResult(result)!);
      half.state = folded.state;
      half.score += folded.runsScored;
      if (folded.batterDone && !folded.batterOut) {
        // A walk. Move the occupants exactly as `advanceOnWalk` moved the
        // booleans — forced runners only, and a runner forced off third scores.
        applyWalk(half, args.batter.id, folded.movements, stats);
      }
      if (folded.runsScored > 0) {
        tally.runs += folded.runsScored;
        log.push(`  ${args.batter.name} walks, ${folded.runsScored} in`);
      }
      if (result.kind === 'foulTip') tally.fouls += 1;
      if (!folded.batterDone) continue;

      if (folded.batterOut) {
        tally.strikeouts += 1;
        tally.plateAppearances += 1;
        stats.push({ t: 'atBat', kid: args.batter.id });
        stats.push({ t: 'kThrown', kid: args.pitcher.id });
        log.push(`  ${args.batter.name} strikes out`);
      } else {
        tally.walks += 1;
        tally.plateAppearances += 1;
        // No `atBat` event: a walk is not an official at-bat.
        log.push(`  ${args.batter.name} walks`);
      }
      return;
    }

    // Contact. The play decides fair, foul, and everything after.
    const runners: Array<{ base: 1 | 2 | 3; char: Character }> = [];
    half.occupants.forEach((id, i) => {
      if (id) runners.push({ base: (i + 1) as 1 | 2 | 3, char: args.lookup(id) });
    });
    const out: { outcome: PlayOutcome | null; scored: string[] } = { outcome: null, scored: [] };
    yield* runPlayLive(
      {
        launch: result.launch,
        batter: args.batter,
        runners,
        defence: args.defence,
        lookup: args.lookup,
        outs: half.state.outs,
        geo: args.geo,
        // The same resolved tune the plate used — one seam, both sides.
        plate: args.plate,
      },
      rng.fork(`play${pitches}`),
      frame,
      out
    );
    const outcome = out.outcome!;
    const scored = out.scored;

    if (outcome.foul) {
      onEvent?.({ t: 'contact', launch: result.launch, hit: 'out', flyCaught: false, foul: true });
      // ★ A FOUL IS A STRIKE, AND `applyAtBat` OWNS THE "never the third" RULE.
      // Restating it here would be a second source of truth for a rule v1
      // already has a test for.
      tally.fouls += 1;
      half.state = applyAtBat(half.state, { kind: 'foul', bases: 0, description: 'Foul ball!' }).state;
      continue;
    }

    tally.ballsInPlay += 1;
    onEvent?.({
      t: 'contact',
      launch: result.launch,
      hit: hitTypeOf(outcome, scored, args.batter.id),
      flyCaught: outcome.flyCaught,
      foul: false,
    });
    // ★ TAKE THE IDENTITIES BEFORE FOLDING. `applyLivePlay` reads four fields
    // and `baseIds` is not one of them.
    half.occupants = [...outcome.baseIds] as [string | null, string | null, string | null];
    const folded = applyLivePlay(half.state, outcome);
    half.state = folded.state;
    half.score += folded.runsScored;
    tally.runs += folded.runsScored;
    tally.plateAppearances += 1;
    stats.push({ t: 'atBat', kid: args.batter.id });
    if (!outcome.batterOut) {
      tally.hits += 1;
      stats.push({ t: 'hit', kid: args.batter.id, homer: scored.includes(args.batter.id) });
      if (scored.includes(args.batter.id)) tally.homeRuns += 1;
    }
    // ★ RUN ATTRIBUTION COMES OFF THE PLAY, NOT THE FOLD. `applyLivePlay`
    // returns a count of runs and drops `baseIds` entirely, so a run folded
    // through it has no owner. The play's own `score` events do.
    for (const id of scored) stats.push({ t: 'run', kid: id });
    log.push(
      `  ${args.batter.name}: ${outcome.description.replace('\n', ' ')}` +
        (folded.runsScored ? ` (${folded.runsScored} in)` : '')
    );
    return;
  }
}

/**
 * Move the base occupants on a walk, mirroring `advanceOnWalk`'s `movements`.
 *
 * The reducer already decided WHICH bases move; this only carries the names
 * along. Applied in the same reverse order for the same reason — a forward pass
 * would overwrite an occupied destination before its runner had left.
 */
function applyWalk(
  half: HalfState,
  batterId: string,
  movements: Array<{ fromBase: number; toBase: number }>,
  stats: StatEvent[]
): void {
  for (const m of [...movements].reverse()) {
    if (m.fromBase === 0) continue; // the batter, handled below
    const who = half.occupants[m.fromBase - 1];
    half.occupants[m.fromBase - 1] = null;
    if (m.toBase >= 4) {
      if (who) stats.push({ t: 'run', kid: who });
    } else {
      half.occupants[m.toBase - 1] = who;
    }
  }
  half.occupants[0] = batterId;
}

/**
 * What the batter got out of it — DERIVED, not decided.
 *
 * `PlayOutcome.baseIds` says which base he ended on, and the play's own `score`
 * events say whether he came all the way round. Nothing in the sim ever labels a
 * hit a double; it is a double because he is standing on second.
 *
 * ★ A HOME RUN AND AN INSIDE-THE-PARKER ARE THE SAME THING HERE, deliberately.
 * `tally.homeRuns` has always counted "the batter scored on his own ball", and
 * splitting them would need the `{t:'homeRun'}` play event, which `runPlay` does
 * not harvest. Recorded in `sim.harnessMethod` as something the harness cannot
 * see rather than quietly conflated.
 */
function hitTypeOf(outcome: PlayOutcome, scored: string[], batterId: string): HitType {
  if (scored.includes(batterId)) return 'HR';
  if (outcome.batterOut) return 'out';
  const at = outcome.baseIds.indexOf(batterId);
  return at === 0 ? '1B' : at === 1 ? '2B' : at === 2 ? '3B' : 'out';
}

/**
 * How long this pitcher's FASTBALL takes to reach the plate.
 *
 * Memoised per arm, the way `releaseAtSpot` memoises the release solve, because
 * every plate appearance with a runner on asks for it and the answer depends on
 * nothing else.
 */
const fastballCache = new Map<number, number>();
function fastballFlightSec(pitchingStat: number): number {
  const hit = fastballCache.get(pitchingStat);
  if (hit !== undefined) return hit;
  const rel = releasePitch({ kind: 'fastball', pitchingStat, aimHeightFt: 2.5, aimLateralFt: 0 });
  const { travelSec } = flyToPlate(rel);
  fastballCache.set(pitchingStat, travelSec);
  return travelSec;
}

/**
 * A stolen base, folded through v1's `inning.applySteal`.
 *
 * Only on a pitch the batter did not put in play — with a ball in play the
 * runner is simply running, and `play.ts` owns him. `applySteal` already knows
 * the rule (the bag ahead must be free, an out is an out) and is on the pure
 * whitelist, so v2 does not restate it.
 */
function tryStealBefore(
  half: HalfState,
  args: {
    defence: Record<string, PositionId>;
    lookup: (id: string) => Character;
    pitcher: Character;
  },
  pitchTravelSec: number,
  rng: Rng
): { safe: boolean; line: string } | null {
  const catcher = catcherOf(args.defence, args.lookup);
  if (!catcher) return null;
  // Nearest bag first: a runner on second stealing third, else first to second.
  for (const from of [2, 1] as const) {
    const who = half.occupants[from - 1];
    if (!who || half.occupants[from]) continue;
    const runner = args.lookup(who);
    const to = (from + 1) as StealTarget;
    // He commits against the pitcher's fastest, not against what is thrown.
    const expected = fastballFlightSec(args.pitcher.stats.pitching);
    const sit = { outs: half.state.outs, nextBagOccupied: half.occupants[from] !== null };
    if (!cpuWantsSteal({ runner, catcher, to, pitchTravelSec: expected }, sit)) continue;
    const race = stealRace({ runner, catcher, to, pitchTravelSec }, rng);
    const folded = applySteal(half.state, from, race.safe);
    half.state = folded.state;
    if (race.safe) {
      half.occupants[from - 1] = null;
      half.occupants[from] = who;
    } else {
      half.occupants[from - 1] = null;
    }
    return {
      safe: race.safe,
      line: `${runner.name} ${race.safe ? 'STEALS' : 'is caught stealing at'} ${to === 2 ? 'second' : 'third'}`,
    };
  }
  return null;
}

/** Step a play to its end, keeping the identities of whoever scored. */
/**
 * Step a play to its end, yielding every tick.
 *
 * The `frame` object is REUSED across ticks — see `LiveFrame`. `out` collects
 * the result because a generator's `return` value is awkward to reach through
 * `yield*`, and the caller needs both.
 */
/**
 * Copy the scoreboard onto the frame. The play and the pitch are set by whoever
 * owns them; everything else is read straight off the half-inning.
 */
function syncFrame(frame: LiveFrame, half: HalfState, phase: LiveFrame['phase']): void {
  frame.phase = phase;
  frame.outs = half.state.outs;
  frame.balls = half.state.count.balls;
  frame.strikes = half.state.count.strikes;
  frame.bases = [...half.state.bases] as [boolean, boolean, boolean];
}

function* runPlayLive(
  spec: Parameters<typeof beginPlay>[0],
  rng: Rng,
  frame: LiveFrame,
  out: { outcome: PlayOutcome | null; scored: string[] }
): Generator<LiveFrame, void, PlayInputs> {
  const s = beginPlay(spec, rng);
  const dt = 1 / 60;
  let guard = 0;
  frame.phase = 'live';
  frame.play = s;
  frame.pitch = null;
  let inputs: PlayInputs = {};
  while (s.phase === 'live' && guard++ < Math.ceil(PLAY.MAX_PLAY_SEC / dt) + 8) {
    stepPlay(s, dt, inputs);
    for (const e of s.events) if (e.t === 'score') out.scored.push(e.runner);
    // ★ WHAT THE CALLER PASSED TO `.next()`. The generator's third type
    // parameter has been `void` since PR 13 and is what makes a live driver
    // able to steer without a second implementation of the flow existing.
    // `simulateGame` drains with a bare `.next()`, which yields `undefined` and
    // falls back to `{}` — so the headless path is unchanged BY CONSTRUCTION,
    // and PR 13's golden fingerprints are what prove it.
    inputs = (yield frame) ?? {};
  }
  out.outcome = finishPlay(s);
  frame.play = null;
}

interface HalfState {
  state: ReturnType<typeof newHalfInning>;
  score: number;
  /**
   * WHO is on each base.
   *
   * ★ THE GAME HAS TO KEEP THIS ITSELF, and that is seam 1 in the header made
   * concrete. `HalfInningState.bases` is three BOOLEANS — v1 never needs to know
   * which kid is on second, because its runners are sprites the scene owns. But
   * `PlaySpec.runners` needs `Character`s, and `applyLivePlay` drops the
   * `baseIds` the play just computed. So the identities live here, updated from
   * the play's own outcome and from a walk's `movements`.
   */
  occupants: [string | null, string | null, string | null];
}

/**
 * Play a whole game.
 *
 * The loop is `gameflow.ts`'s, not ours: it decides what follows a half, when a
 * bottom is pointless, and when a tie has run out of bonus innings.
 */
/**
 * A whole game, yielding every tick — the ONE implementation of the flow.
 *
 * `simulateGame` drains this; the render layer pumps it against a real clock.
 * A separate live driver would be a second implementation of the game flow, and
 * the harness would have no way to know when the two drifted.
 */
export function* simulateGameLive(spec: GameSpec, rng: Rng): Generator<LiveFrame, GameResult, PlayInputs> {
  const geo = spec.geo ?? DEFAULT_GEOMETRY;
  const regulation = spec.regulationInnings ?? GAME.REGULATION_INNINGS;
  const mk = (t: TeamSpec): Side => ({
    spec: t,
    plan: planDefence(t.ids, spec.lookup),
    lineupIdx: 0,
    score: 0,
  });
  const away = mk(spec.away);
  const home = mk(spec.home);

  const log: string[] = [];
  const stats: StatEvent[] = [];
  const tally = EMPTY_TALLY();
  const lineScore: Array<[number, number | null]> = [];

  let inning = 1;
  let half: 'top' | 'bottom' = 'top';
  let walkOff = false;
  let tie = false;
  /** Innings actually PLAYED, which is not the same as the inning reached. */
  let played = 1;

  const frame: LiveFrame = {
    phase: 'between',
    inning: 1,
    half: 'top',
    outs: 0,
    balls: 0,
    strikes: 0,
    awayScore: 0,
    homeScore: 0,
    bases: [false, false, false],
    batterId: '',
    pitcherId: '',
    defence: {},
    play: null,
    pitch: null,
  };

  for (;;) {
    frame.inning = inning;
    frame.half = half;
    const bat = half === 'top' ? away : home;
    const field = half === 'top' ? home : away;
    const hs: HalfState = { state: newHalfInning(), score: 0, occupants: [null, null, null] };
    log.push(`${half === 'top' ? 'Top' : 'Bot'} ${inning} — ${bat.spec.name}`);

    while (!isHalfOver(hs.state)) {
      const batter = spec.lookup(bat.plan.order[bat.lineupIdx % bat.plan.order.length]);
      yield* playAtBatLive(
        {
          batter,
          pitcher: spec.lookup(field.plan.pitcherId),
          defence: field.plan.positions,
          lookup: spec.lookup,
          geo,
          half: hs,
          tally,
          stats,
          log,
          onEvent: spec.onEvent,
          plate: resolvePlate(spec.plate),
          frame,
        },
        rng.fork(`${inning}${half}${bat.lineupIdx}`)
      );
      syncFrame(frame, hs, 'between');
      frame.awayScore = away.score + (half === 'top' ? hs.score : 0);
      frame.homeScore = home.score + (half === 'bottom' ? hs.score : 0);
      yield frame;
      // ★ The caller advances the order, and only on a completed batter. Every
      // path out of `playAtBat` is a completed batter, which is what makes that
      // safe here and is why v1 has to repeat the check at four call sites.
      //
      // ★ AND LEAVING IT OUT DOES NOT MISCOUNT — IT HANGS. The per-PA fork is
      // keyed on `lineupIdx`, so a frozen index means the identical plate
      // appearance forever; if that one happens to be a walk or a hit, outs
      // never accrue and `while (!isHalfOver(...))` never exits. Found by
      // deleting the line: the suite stopped finishing rather than failing.
      bat.lineupIdx += 1;

      if (half === 'bottom' && isWalkOff(inning, regulation, half, home.score + hs.score, away.score)) {
        home.score += hs.score;
        lineScore.push([lineScore[inning - 1]?.[0] ?? 0, hs.score]);
        log.push(`WALK-OFF! ${home.spec.name} win it`);
        walkOff = true;
        played = inning;
        break;
      }
    }

    if (walkOff) break;

    if (half === 'top') {
      away.score += hs.score;
      lineScore.push([hs.score, null]);
    } else {
      home.score += hs.score;
      lineScore[inning - 1] = [lineScore[inning - 1][0], hs.score];
    }

    // ★ AFTER THE TOP HALF, NOT BEFORE IT. `shouldSkipBottom` means "do not play
    // the BOTTOM" — the home team already leads, so their at-bats cannot change
    // anything. Asking it at the top of the loop skips the wrong half: the game
    // ended before the visitors had batted, and the line score showed five
    // innings while the result claimed six. v1 asks it inside `endHalf`, with
    // `this.half === 'top'` already true, which is the same placement.
    //
    // ★ AND THE ARGUMENTS ARE HOME THEN AWAY here, while `decideAfterHalf`
    // below takes AWAY THEN HOME. Same file, three functions apart, reversed.
    if (half === 'top' && shouldSkipBottom(inning, regulation, home.score, away.score)) {
      log.push(`— no bottom of ${inning}, ${home.spec.name} lead —`);
      played = inning;
      break;
    }

    const next = decideAfterHalf(inning, half, regulation, away.score, home.score, GAME.MAX_EXTRA_INNINGS);
    played = inning;
    if (next.done) {
      tie = next.tie;
      break;
    }
    inning = next.inning;
    half = next.half;
    if (next.extra) log.push(`— tie game, bonus inning —`);
  }

  return {
    awayScore: away.score,
    homeScore: home.score,
    lineScore,
    innings: played,
    tie,
    walkOff,
    lines: foldStats({}, stats),
    log,
    tally,
  };
}

/**
 * The headless game: drain the generator.
 *
 * ★ THE GATE ON THIS REFACTOR IS OUTPUT IDENTITY. `sim.gameShape` and every
 * harness pin rest on what this function returns, so `game.test.ts` asserts the
 * same seed yields byte-identical results across seeds and venues. If one
 * differs, the refactor is wrong — there is nothing to interpret.
 */
export function simulateGame(spec: GameSpec, rng: Rng): GameResult {
  const it = simulateGameLive(spec, rng);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

