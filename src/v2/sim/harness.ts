// ---------------------------------------------------------------------------
// The statistical harness. PURE, and it plays nothing — it is FED.
//
// ★ ONE IMPLEMENTATION, TWO ENTRY POINTS, which is the shape this repo already
// uses for its expensive gates: `layout.browser.js` is the audit and
// `layout-audit.mjs` is the driver. Here `harness.test.ts` runs a small seeded
// slice on every PR and `scripts/v2/harness.mjs` runs the full 50,000 plate
// appearances offline, and both aggregate through this file. A slice that
// measured something subtly different from the full run would be worse than no
// slice at all.
//
// ★ WHY A SLICE RUNS IN CI AT ALL. `scripts/goldlogs.json` records what
// offline-only costs: "A gate nobody runs is a gate nobody notices breaking.
// #24 touched constants squarely on the seeded rng path and skipped the goldlog
// step the delivery process calls for." A rate that moves is exactly the kind of
// regression a reviewer cannot see in a diff.
//
// ★ AND WHAT THIS FILE IS CAREFUL NOT TO DO. The roadmap sentence promises the
// harness "asserts emergent BABIP / launch-angle split / exit-velocity shape
// against real baseball bands". For most of those there is no band to assert
// against: published youth data is thin, mostly 9U and up, and `sim.note` is
// explicit that borrowing MLB's numbers is THE failure the `reference` field
// exists to prevent — "conforming a game for four-to-eight-year-olds to MLB's
// strikeout rate". So this measures, and the records pin, and each one says what
// would close it. `sim.batSpeed` is the precedent.
//
// Counters only — no retained samples. 50,000 plate appearances of kept objects
// is a memory bill for nothing, and `rng.test.ts` already records the related
// trap: "Math.min(...xs) on 200k values overflows the call stack".
// ---------------------------------------------------------------------------

import type { GameResult, SimEvent } from './game';
import { ftsToMph } from './units';

/**
 * How a batted ball is classified by launch angle.
 *
 * ★ THE CUTS ARE A CONVENTION, NOT A MEASUREMENT, and saying so is the point.
 * These are the boundaries broadcast baseball uses, and nothing about them is
 * physics — a ball at 9.9 degrees and one at 10.1 do the same thing. They are
 * here so the shape can be COMPARED to the way the sport reports itself, and
 * `sim.battedBallSplit` records that the bin edges are borrowed rather than
 * derived. Changing them changes the split without changing the sim, which is
 * exactly why the record names them.
 */
export const LAUNCH_CUTS = { ground: 10, line: 25, fly: 50 } as const;

export type BattedBallKind = 'ground' | 'line' | 'fly' | 'popup';

export function classifyLaunch(launchAngleDeg: number): BattedBallKind {
  if (launchAngleDeg < LAUNCH_CUTS.ground) return 'ground';
  if (launchAngleDeg < LAUNCH_CUTS.line) return 'line';
  if (launchAngleDeg < LAUNCH_CUTS.fly) return 'fly';
  return 'popup';
}

/** Exit-velocity histogram, mph. Wide enough to hold anything the sim can make. */
export const EV_BIN_MPH = 2;
export const EV_BINS = 50; // 0-100 mph

/** Launch-angle histogram, degrees, from -90 to +90. */
export const LA_BIN_DEG = 5;
export const LA_BINS = 36;

export interface HarnessTotals {
  games: number;
  plateAppearances: number;
  pitches: number;
  runs: number;

  // --- the plate ---
  pitchesInZone: number;
  swings: number;
  swingsInZone: number;
  swingsOutOfZone: number;
  pitchesOutOfZone: number;
  whiffs: number;
  takenStrikes: number;
  /**
   * Pitches thrown with two strikes already, and swings at them.
   *
   * ★ THESE EXIST BECAUSE THE GATE SWEEP FOUND THE COUNT UNASSERTED. `SimEvent`
   * carried `balls`/`strikes` from the start, and replacing them with a constant
   * `0-0` broke nothing — a field nobody reads is a field nobody can trust. They
   * are also the direct measurement of `ATBAT.TWO_STRIKE_PROTECT_FT`, which
   * `sim.plateDiscipline` claims is "measured: chase rate on an 0-2 count is
   * materially higher than on 1-1".
   */
  twoStrikePitches: number;
  twoStrikeSwings: number;
  strikeouts: number;
  walks: number;
  stealAttempts: number;
  stealsSafe: number;
  foulsSeen: number;

  // --- the batted ball ---
  battedFair: number;
  battedFoul: number;
  byKind: Record<BattedBallKind, number>;
  byHit: { out: number; '1B': number; '2B': number; '3B': number; HR: number };
  flyCaught: number;
  evBins: number[];
  laBins: number[];
  evSumMph: number;
}

export function newTotals(): HarnessTotals {
  return {
    games: 0,
    plateAppearances: 0,
    pitches: 0,
    runs: 0,
    pitchesInZone: 0,
    swings: 0,
    swingsInZone: 0,
    swingsOutOfZone: 0,
    pitchesOutOfZone: 0,
    whiffs: 0,
    takenStrikes: 0,
    twoStrikePitches: 0,
    twoStrikeSwings: 0,
    strikeouts: 0,
    walks: 0,
    stealAttempts: 0,
    stealsSafe: 0,
    foulsSeen: 0,
    battedFair: 0,
    battedFoul: 0,
    byKind: { ground: 0, line: 0, fly: 0, popup: 0 },
    byHit: { out: 0, '1B': 0, '2B': 0, '3B': 0, HR: 0 },
    flyCaught: 0,
    evBins: new Array(EV_BINS).fill(0),
    laBins: new Array(LA_BINS).fill(0),
    evSumMph: 0,
  };
}

/** Fold one streamed event. Called once per pitch and once per batted ball. */
export function observe(t: HarnessTotals, e: SimEvent): void {
  if (e.t === 'pitch') {
    t.pitches += 1;
    if (e.inZone) t.pitchesInZone += 1;
    else t.pitchesOutOfZone += 1;
    if (e.swung) {
      t.swings += 1;
      if (e.inZone) t.swingsInZone += 1;
      else t.swingsOutOfZone += 1;
      if (e.kind === 'swingingStrike') t.whiffs += 1;
    } else if (e.kind === 'calledStrike') {
      t.takenStrikes += 1;
    }
    if (e.strikes >= 2) {
      t.twoStrikePitches += 1;
      if (e.swung) t.twoStrikeSwings += 1;
    }
    if (e.kind === 'foulTip') t.foulsSeen += 1;
    return;
  }

  // The `pa` event restates the stats stream for the HUD; the harness already
  // counts plate appearances from the result, so counting it here would
  // double-book every one.
  if (e.t !== 'contact') return;

  if (e.foul) {
    t.battedFoul += 1;
    t.foulsSeen += 1;
    return;
  }
  t.battedFair += 1;
  t.byKind[classifyLaunch(e.launch.launchAngleDeg)] += 1;
  t.byHit[e.hit] += 1;
  if (e.flyCaught) t.flyCaught += 1;

  const mph = ftsToMph(e.launch.exitVelocityFts);
  t.evSumMph += mph;
  t.evBins[clampBin(Math.floor(mph / EV_BIN_MPH), EV_BINS)] += 1;
  t.laBins[clampBin(Math.floor((e.launch.launchAngleDeg + 90) / LA_BIN_DEG), LA_BINS)] += 1;
}

/**
 * Fold a finished game's counting stats.
 *
 * Plate appearances, strikeouts and walks live on `GameTally` rather than in the
 * event stream, because they are decisions `inning.applyAtBat` makes and not
 * things a pitch knows about itself. The harness reads both streams.
 */
export function observeGame(t: HarnessTotals, g: GameResult): void {
  t.games += 1;
  t.plateAppearances += g.tally.plateAppearances;
  t.strikeouts += g.tally.strikeouts;
  t.walks += g.tally.walks;
  t.stealAttempts += g.tally.stealAttempts;
  t.stealsSafe += g.tally.stealsSafe;
  t.runs += g.tally.runs;
}

function clampBin(i: number, n: number): number {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

export interface HarnessRates {
  games: number;
  plateAppearances: number;
  /** Strikeouts and walks as a share of plate appearances. */
  strikeoutPct: number;
  walkPct: number;
  /** Pitches the umpire called a strike, as a share of all pitches. */
  zonePct: number;
  /** Swings at pitches outside the zone, over pitches outside the zone. */
  chasePct: number;
  /** Swings at pitches inside it, over pitches inside it. */
  zoneSwingPct: number;
  /** Whiffs over swings. */
  whiffPct: number;
  /** Fouls over pitches — the tip and the batted foul together. */
  foulPct: number;
  /** Swings at a pitch with two strikes, over those pitches. Protection. */
  twoStrikeSwingPct: number;
  pitchesPerPlateAppearance: number;
  /**
   * ★ BABIP, computed the one way it is defined: hits that were not home runs,
   * over balls in play that were not home runs. Fouls are not balls in play.
   */
  babip: number;
  battingAverageOnContact: number;
  /** Fair batted balls by launch-angle class, as shares. */
  split: Record<BattedBallKind, number>;
  /**
   * Extra-base share of hits.
   *
   * ★ ALSO A GATE-SWEEP FINDING. Deriving hit type wrongly — crediting every
   * baserunner a single — moved no pinned rate, because BABIP counts hits and
   * does not care which kind. This is the number that does care.
   */
  extraBasePct: number;
  runsPerGame: number;
  /** Steal attempts per game, and how many of them were safe. */
  stealAttemptsPerGame: number;
  stealSuccessPct: number;
  exitVelocityMeanMph: number;
  exitVelocityMedianMph: number;
  exitVelocityP90Mph: number;
  launchAngleMedianDeg: number;
  /**
   * The MEAN launch angle, degrees.
   *
   * ★ THE ONE STATISTIC THAT WOULD HAVE CAUGHT A SWING WITH NO PLANE. For four
   * PRs `contact.ts` derived the launch angle from a zero-mean undercut alone,
   * so this number was 0 BY CONSTRUCTION — every kid swung dead level and the
   * average batted ball was a line drive into the dirt. The median could not see
   * it (it read 2.5, which looks merely low), and no total could: the share of
   * grounders was 60% for a purely arithmetic reason. A mean is what makes the
   * absence of `BAT.ATTACK_ANGLE_DEG` visible as a number rather than as a feel.
   */
  launchAngleMeanDeg: number;
}

export function rates(t: HarnessTotals): HarnessRates {
  const pa = Math.max(1, t.plateAppearances);
  const hits = t.byHit['1B'] + t.byHit['2B'] + t.byHit['3B'] + t.byHit.HR;
  const inPlayNoHr = Math.max(1, t.battedFair - t.byHit.HR);
  const fair = Math.max(1, t.battedFair);
  return {
    games: t.games,
    plateAppearances: t.plateAppearances,
    strikeoutPct: t.strikeouts / pa,
    walkPct: t.walks / pa,
    zonePct: t.pitchesInZone / Math.max(1, t.pitches),
    chasePct: t.swingsOutOfZone / Math.max(1, t.pitchesOutOfZone),
    zoneSwingPct: t.swingsInZone / Math.max(1, t.pitchesInZone),
    whiffPct: t.whiffs / Math.max(1, t.swings),
    foulPct: t.foulsSeen / Math.max(1, t.pitches),
    twoStrikeSwingPct: t.twoStrikeSwings / Math.max(1, t.twoStrikePitches),
    pitchesPerPlateAppearance: t.pitches / pa,
    babip: (hits - t.byHit.HR) / inPlayNoHr,
    battingAverageOnContact: hits / fair,
    split: {
      ground: t.byKind.ground / fair,
      line: t.byKind.line / fair,
      fly: t.byKind.fly / fair,
      popup: t.byKind.popup / fair,
    },
    extraBasePct: (t.byHit['2B'] + t.byHit['3B'] + t.byHit.HR) / Math.max(1, hits),
    runsPerGame: t.runs / Math.max(1, t.games),
    stealAttemptsPerGame: t.stealAttempts / Math.max(1, t.games),
    stealSuccessPct: t.stealsSafe / Math.max(1, t.stealAttempts),
    exitVelocityMeanMph: t.evSumMph / fair,
    exitVelocityMedianMph: percentileFromBins(t.evBins, EV_BIN_MPH, 0, 0.5),
    exitVelocityP90Mph: percentileFromBins(t.evBins, EV_BIN_MPH, 0, 0.9),
    launchAngleMedianDeg: percentileFromBins(t.laBins, LA_BIN_DEG, -90, 0.5),
    launchAngleMeanDeg: meanFromBins(t.laBins, LA_BIN_DEG, -90),
  };
}

/** The mean off a histogram, using each bin's midpoint. */
export function meanFromBins(bins: number[], width: number, origin: number): number {
  let n = 0;
  let sum = 0;
  for (let i = 0; i < bins.length; i++) {
    n += bins[i];
    sum += bins[i] * (origin + (i + 0.5) * width);
  }
  return n === 0 ? NaN : sum / n;
}

/**
 * A percentile off a histogram, to bin resolution.
 *
 * Bins rather than a kept array on purpose — see the header. The answer is the
 * MIDPOINT of the bin the percentile falls in, so it is accurate to half a bin
 * and cannot be mistaken for an exact order statistic.
 */
export function percentileFromBins(bins: number[], width: number, origin: number, p: number): number {
  let total = 0;
  for (const b of bins) total += b;
  if (total === 0) return NaN;
  const want = total * p;
  let seen = 0;
  for (let i = 0; i < bins.length; i++) {
    seen += bins[i];
    if (seen >= want) return origin + (i + 0.5) * width;
  }
  return origin + (bins.length - 0.5) * width;
}

/**
 * ★ THERE IS NO `hardHitPct`, AND ITS ABSENCE IS A FINDING.
 *
 * Broadcast baseball defines a hard-hit ball as one leaving the bat at 95 mph or
 * more. The roster's exit velocities run 43-61. Applying the threshold gives
 * zero, every time, for every kid, forever — a statistic that cannot vary is not
 * a measurement, and worse, it is precisely the MLB-contamination `sim.note`
 * warns about wearing a number instead of a rate.
 *
 * A relative threshold ("the top decile of what THIS roster hits") would vary,
 * but it would be a restatement of the exit-velocity distribution the harness
 * already reports, with a name borrowed from a sport that means something else
 * by it. So: report the distribution, name the absence, and let
 * `sim.battedBallSplit` carry the reason.
 */
export const HARD_HIT_IS_DELIBERATELY_ABSENT = true;
