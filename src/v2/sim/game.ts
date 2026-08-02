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
import { pitchAndSwing, type PitchResult } from './atbat';
import { beginPlay, finishPlay, stepPlay, type PlayOutcome } from './play';
import { planDefence, type DefencePlan } from './lineup';
import { DEFAULT_GEOMETRY, type FieldGeometry, type PositionId } from './field';
import type { Rng } from './rng';

import { applyAtBat, applyLivePlay, isHalfOver, newHalfInning } from '../../systems/inning';
import { decideAfterHalf, isWalkOff, shouldSkipBottom } from '../../systems/gameflow';
import { foldStats, type KidStats, type StatEvent } from '../../systems/stats';
import type { AtBatResult } from '../../systems/atbat';

export interface TeamSpec {
  name: string;
  /** Nine ids. `planDefence` decides where they stand and when they bat. */
  ids: string[];
}

export interface GameSpec {
  away: TeamSpec;
  home: TeamSpec;
  lookup: (id: string) => Character;
  geo?: FieldGeometry;
  regulationInnings?: number;
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
function playAtBat(
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
  },
  rng: Rng
): void {
  const { half, tally, stats, log } = args;
  let pitches = 0;

  for (;;) {
    if (pitches++ >= GAME.MAX_PITCHES_PER_PA) {
      // ★ A CAP THAT FIRES IS A BUG THAT WAS CAUGHT, not a rule — same
      // discipline as `PLAY.MAX_PLAY_SEC`. No real plate appearance runs this
      // long; if one does, the count is not advancing and a test says so.
      throw new Error(`plate appearance exceeded ${GAME.MAX_PITCHES_PER_PA} pitches`);
    }
    tally.pitches += 1;

    const result = pitchAndSwing(
      { pitcher: args.pitcher, batter: args.batter, count: half.state.count },
      rng.fork(`p${pitches}`)
    );

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
    const { outcome, scored } = runPlay(
      {
        launch: result.launch,
        batter: args.batter,
        runners,
        defence: args.defence,
        lookup: args.lookup,
        outs: half.state.outs,
        geo: args.geo,
      },
      rng.fork(`play${pitches}`)
    );

    if (outcome.foul) {
      // ★ A FOUL IS A STRIKE, AND `applyAtBat` OWNS THE "never the third" RULE.
      // Restating it here would be a second source of truth for a rule v1
      // already has a test for.
      tally.fouls += 1;
      half.state = applyAtBat(half.state, { kind: 'foul', bases: 0, description: 'Foul ball!' }).state;
      continue;
    }

    tally.ballsInPlay += 1;
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

/** Step a play to its end, keeping the identities of whoever scored. */
function runPlay(
  spec: Parameters<typeof beginPlay>[0],
  rng: Rng
): { outcome: PlayOutcome; scored: string[] } {
  const s = beginPlay(spec, rng);
  const scored: string[] = [];
  const dt = 1 / 60;
  let guard = 0;
  while (s.phase === 'live' && guard++ < Math.ceil(PLAY.MAX_PLAY_SEC / dt) + 8) {
    stepPlay(s, dt);
    for (const e of s.events) if (e.t === 'score') scored.push(e.runner);
  }
  return { outcome: finishPlay(s), scored };
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
export function simulateGame(spec: GameSpec, rng: Rng): GameResult {
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

  for (;;) {
    const bat = half === 'top' ? away : home;
    const field = half === 'top' ? home : away;
    const hs: HalfState = { state: newHalfInning(), score: 0, occupants: [null, null, null] };
    log.push(`${half === 'top' ? 'Top' : 'Bot'} ${inning} — ${bat.spec.name}`);

    while (!isHalfOver(hs.state)) {
      const batter = spec.lookup(bat.plan.order[bat.lineupIdx % bat.plan.order.length]);
      playAtBat(
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
        },
        rng.fork(`${inning}${half}${bat.lineupIdx}`)
      );
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

