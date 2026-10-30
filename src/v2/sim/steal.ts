// ---------------------------------------------------------------------------
// The stolen base. PURE.
//
// ★ IT IS A RACE, NOT A ROLL. `systems/steal.ts` is a probability formula —
// `p = 0.5 + (speed-5)*0.05 - (arm-5)*0.05 - reactBonus*0.06 + 0.12 if slow
// stuff`, clamped to 0.08..0.92 — which is the "outcome distribution rather than
// a kid" model `sim.plateDiscipline` describes replacing everywhere else. Every
// term v1 approximates there, v2 already owns as a real quantity: the runner's
// leg (`sprintTimeForFt`), the catcher's read (`reactionSec`), his transfer
// (`DEFENSE.RELEASE_SEC`) and his arm (`throwFlightSec`, which returns null when
// he simply cannot reach the bag).
//
// ★ THE LEAD AND THE JUMP ARE WHAT MAKE IT A CONTEST, and leaving them out is
// the trap. Raced from a standing start on the bag, the steal is degenerate: the
// runner loses to any arm that can reach second by 1.1-2.4s, and beats any arm
// that cannot by definition. Nobody would ever steal, and no tuning would fix it
// because the shape is wrong, not the level. A real runner is already ten feet
// off the bag and moving at release.
//
// ★ AND THE SLOW-PITCH ADVANTAGE IS EMERGENT. v1 adds a flat +0.12 for a
// changeup or curve. Here the catcher cannot begin until the ball reaches him,
// so a changeup's 1.33s flight hands the runner 0.31s more than a fastball's
// 1.02s — enough to flip a speed-5 runner against a strong arm from out by 0.18
// to safe by 0.13. Nothing says so; it falls out of `PitchResult.travelSec`.
//
// There is deliberately NO attempt rate and NO success rate. The runner goes
// when he projects to win, and the only randomness is how well he read the
// pitcher — one error term, the `plateJudgementFt` pattern. `sim.stealRace`.
// ---------------------------------------------------------------------------

import type { Character } from '../../data/types';
import { FIELD_POSITIONS, FIRST, MOUND, SECOND, THIRD, type PositionId } from './field';
import { BASEPATH } from './field';
import { throwFlightSec } from './fielders';
import { reactionSec, sprintAccelFtS2, sprintTimeForFt, sprintTopSpeedFts } from './athletes';
import { DEFENSE, RUN } from './params';
import type { Rng } from './rng';

/** Which bag is being taken, and therefore who throws where. */
export type StealTarget = 2 | 3;

export interface StealSpec {
  runner: Character;
  catcher: Character;
  /** The bag being stolen. */
  to: StealTarget;
  /**
   * The pitch's flight time, seconds. The catcher cannot start until it
   * arrives, so this IS the runner's head start — see the header.
   */
  pitchTravelSec: number;
  /**
   * The pitcher, for the RELAY (`throwLegsSec`): when the catcher's arm cannot
   * reach the bag the ball goes to the mound and on. Omitted, an unreachable
   * bag is a free steal — the pre-relay shape, kept so a test can show what
   * the relay changed.
   */
  pitcher?: Character;
  /**
   * A PERSON'S read, seconds after the pitch arrives, in place of the kid's
   * own `reactionSec`. This is the THROW! verb (`PlayInputs.throwDown`): a tap
   * as the ball arrives is a perfect read, a late tap is a late one, and no
   * tap at all is the kid fielding for himself — the model's own error term
   * supplied by a person, the shape `HumanSwing` already has.
   */
  readSec?: number;
}

export interface StealResult {
  safe: boolean;
  /** Seconds by which the runner beat the throw. Negative is out. */
  marginSec: number;
  /** True when no throw — direct or relayed — can reach the bag at all. */
  outOfRange: boolean;
  /** True when the throw went catcher -> pitcher -> bag. */
  relayed: boolean;
}

/** Where the throw goes. */
function bagFor(to: StealTarget) {
  return to === 2 ? SECOND : THIRD;
}

/**
 * The throw's flight, catcher to bag: direct when his arm reaches, else RELAYED
 * through the pitcher — catcher to the mound, a transfer, mound to the bag.
 * Null only when neither route exists.
 *
 * ★ THE RELAY IS WHAT ENDS THE FREE STEAL. Thrown direct, 16 of 30 kids cannot
 * reach second, and `sim.stealRace` measured what that cost: against half the
 * roster's catchers the runner's margin was literally INFINITE, no confidence
 * threshold could decline it, and the CPU stole 10.3 bases a game at 96% — in
 * silence, because nothing drew it. A catcher who cannot reach the bag does
 * not stand there holding the ball; he throws to the pitcher, who turns and
 * throws on. Both legs are short enough for every arm in the roster (about
 * 46ft and 39ft), so every catcher's margin is finite and `cpuWantsSteal` can
 * decline a race it would lose. It is the cutoff man again (`sim.cutoffRelay`):
 * a consequence of arm range, not a mechanic, and it costs exactly what two
 * throws and a transfer cost. No constant was added or moved.
 */
export function throwLegsSec(spec: StealSpec): { fly: number; relayed: boolean } | null {
  const bag = bagFor(spec.to);
  const direct = throwFlightSec(FIELD_POSITIONS.C, bag, spec.catcher.stats.pitching);
  if (direct !== null) return { fly: direct, relayed: false };
  if (!spec.pitcher) return null;
  const toMound = throwFlightSec(FIELD_POSITIONS.C, MOUND, spec.catcher.stats.pitching);
  const onward = throwFlightSec(MOUND, bag, spec.pitcher.stats.pitching);
  if (toMound === null || onward === null) return null;
  return { fly: toMound + DEFENSE.RELEASE_SEC + onward, relayed: true };
}

/** The catcher's read: a person's own when one is fielding, else the kid's. */
function readSecOf(spec: StealSpec): number {
  return spec.readSec ?? reactionSec(spec.catcher.stats.fielding);
}

/**
 * How long the DEFENCE needs to put the ball on the bag, from release.
 *
 * Pitch flight, then the catcher's read, then his transfer, then the throw —
 * direct or relayed (`throwLegsSec`). Null when no throw can get there, which
 * with the relay is no catcher in the roster; the branch stays for a spec
 * without a pitcher.
 */
export function throwSecTo(spec: StealSpec): number | null {
  const legs = throwLegsSec(spec);
  if (legs === null) return null;
  return spec.pitchTravelSec + readSecOf(spec) + DEFENSE.RELEASE_SEC + legs.fly;
}

/**
 * How long the RUNNER needs, from release, off his lead.
 *
 * A standing start: he is leading, not sprinting, when the pitcher commits.
 * `sprintTimeForFt`'s `fromFts` is deliberately 0 here — unlike a fielder's
 * first step, a runner on a lead is stationary and side-on.
 */
export function runnerSecTo(spec: StealSpec): number {
  const speed = spec.runner.stats.speed;
  return sprintTimeForFt(
    BASEPATH - RUN.LEAD_FT,
    sprintTopSpeedFts(speed),
    sprintAccelFtS2(speed),
    0
  );
}

/** The race as it would run with a perfect jump. No randomness. */
export function projectedMarginSec(spec: StealSpec): number {
  const d = throwSecTo(spec);
  if (d === null) return Infinity;
  return d - runnerSecTo(spec);
}

/**
 * Run it, with the jump.
 *
 * ★ THE JUMP IS THE ONLY RANDOMNESS, and it is an error in TIME rather than a
 * coin weighted by the outcome. A runner who reads the pitcher's first move
 * leaves on release; one who does not loses a fraction of a second. Sized
 * against `RUN.JUMP_SIGMA_SEC` and scaled by how good a baserunner he is, so a
 * fast kid with a bad jump can be thrown out and a slow one with a great jump
 * can steal — which is the whole point of not having a success rate.
 */
export function stealRace(spec: StealSpec, rng: Rng): StealResult {
  const legs = throwLegsSec(spec);
  if (legs === null) return { safe: true, marginSec: Infinity, outOfRange: true, relayed: false };
  const d = spec.pitchTravelSec + readSecOf(spec) + DEFENSE.RELEASE_SEC + legs.fly;
  const marginSec = d - (runnerSecTo(spec) + jumpSecOf(spec.runner, rng));
  return { safe: marginSec > 0, marginSec, outOfRange: false, relayed: legs.relayed };
}

/**
 * This runner's jump on THIS pitch, seconds late (negative is early).
 *
 * ★ ONE DRAW, READ TWICE. `decideSteal` asks it to choose the pitch he goes
 * on and `stealRace` asks it again to run the race; `fork('jump')` off the
 * same per-pitch stream returns the same number both times (`rng.ts`: a
 * substream is a function of its label, not of who asked first), so the
 * runner who went on a good read races on that read.
 */
export function jumpSecOf(runner: Character, rng: Rng): number {
  return rng.fork('jump').bell() * jumpSigmaSec(runner.stats.speed);
}

/**
 * How badly this kid can misread the pitcher, seconds.
 *
 * Speed is the only baserunning stat the roster carries, so it stands in for
 * instinct as well as pace — a fast kid is the one who has practised leaving.
 */
export function jumpSigmaSec(speedStat: number): number {
  const t = (speedStat - 1) / 9;
  return RUN.JUMP_SIGMA_WORST_SEC + (RUN.JUMP_SIGMA_BEST_SEC - RUN.JUMP_SIGMA_WORST_SEC) * t;
}

/** What the runner needs to know beyond the race itself. */
export interface StealSituation {
  outs: number;
  /** Is the base he would vacate behind another runner? Never steal into traffic. */
  nextBagOccupied: boolean;
  /**
   * His read of this pitch's first move (`jumpSecOf`), when the caller has
   * one. He picks his pitch: later than `RUN.GO_ON_JUMP_SEC` and he holds.
   */
  jumpSec?: number;
}

/**
 * Does he go?
 *
 * ★ THE RACE ALONE SAYS "ALWAYS", AND MEASURING THAT IS WHAT BUILT THIS.
 * "Go when you project to win" is the pure version and it produced 15.4 steal
 * attempts per game at 94% safe — every runner stealing every time, which reads
 * as the defence being scenery, the same failure PR 10 fixed for balls in play.
 * The cause is `sim.throwSpeed`'s band reaching a third consequence: only 14 of
 * 30 kids can throw the 90ft to second, so against half the roster's catchers a
 * steal is FREE and no confidence threshold can decline it — the margin is
 * literally infinite. Measured: a 1.0-sigma threshold cut attempts 70% to 60%,
 * and shrinking the lead from 10ft to 3ft still left 9 attempts a game.
 *
 * ★ SO THE LIMIT IS SITUATIONAL, NOT PROBABILISTIC, and it is a decision model
 * rather than a frequency knob — nothing here can make steals rarer without
 * also making them worse baseball:
 *
 *   - SECOND IS WORTH TAKING; THIRD USUALLY IS NOT. Second is scoring position:
 *     a runner there scores on a single. From second, third adds almost nothing
 *     — he already scores on the same hit — while the out costs the same. So
 *     third is taken only when it is close to free.
 *   - AN OUT WITH TWO OUTS ENDS THE INNING, and a runner on second was going to
 *     score on the next single anyway. He stays.
 *   - NEVER INTO TRAFFIC, which `applySteal` would refuse anyway.
 */
export function cpuWantsSteal(spec: StealSpec, sit: StealSituation): boolean {
  if (sit.nextBagOccupied) return false;
  const margin = projectedMarginSec(spec);
  if (!(margin > 0)) return false;

  // Two outs: the out ends the inning and the base buys nothing he does not
  // already have. The exception is a runner who cannot be thrown out at all.
  if (sit.outs >= 2) return false;
  // ★ HE PICKS HIS PITCH. A runner who went on the first pitch he projected
  // to win was a free out for a pitcher who threw over on the first pitch.
  // He goes on the pitch he reads well, which is the same draw the race runs
  // on — so he is never caught by a read he declined.
  if (sit.jumpSec !== undefined && sit.jumpSec > RUN.GO_ON_JUMP_SEC) return false;

  if (spec.to === 3) {
    // Third only when it is close to free — he is already in scoring position.
    return !Number.isFinite(margin) ? true : margin > RUN.STEAL_THIRD_MARGIN_SEC;
  }
  return true;
}

/** The catcher, out of a defence plan. Null if somebody forgot to field one. */
export function catcherOf(
  positions: Record<string, PositionId>,
  lookup: (id: string) => Character
): Character | null {
  for (const [id, pos] of Object.entries(positions)) if (pos === 'C') return lookup(id);
  return null;
}

// ---------------------------------------------------------------------------
// The pickoff. A throw over to a bag instead of a pitch — v1's #7, BB2001's
// counter to the steal — raced like the steal is, not rolled like v1's
// `rollPickoff` (0.6 leaning / 0.06 home).
//
// ★ TWO LEADS, AND THAT IS THE WHOLE MODEL. A runner who is going is on the
// steal lead (`RUN.LEAD_FT`) with his weight forward; a runner who is not is on
// the lead he can get back from against THIS arm with `LEAD_RETURN_MARGIN_SEC`
// to spare (`setLeadFt`). Raced from the steal lead a set runner is simply
// out: at a kid's acceleration ten feet takes longer to return from than any
// roster arm takes to throw the forty-odd feet to the bag — the same
// degeneracy the steal had from a standing start, with the sign flipped. A
// lead is BY DEFINITION one you can return from, so the set lead is solved
// from the arm rather than fixed, and the set runner's only risk is his read.
//
// ★ THE LEANING RUNNER IS IN A REAL RACE. Across the roster he is out by ~0.4s
// against a strong arm and back by ~0.1s against a weak one with a quick
// kid's legs, and the jump decides the rest — about v1's 0.6 from physics
// rather than as a constant. `sim.pickoffRace` records the spread.
// ---------------------------------------------------------------------------

export interface PickoffSpec {
  runner: Character;
  pitcher: Character;
  /** The bag thrown to — the lead runner's, first or second. */
  base: 1 | 2;
  /** Had he decided to go on this pitch? Then he is on the steal lead, leaning. */
  leaning: boolean;
}

export interface PickoffResult {
  out: boolean;
  /** Seconds by which the runner beat the tag. Negative is out. */
  marginSec: number;
  /** The lead he was returning from, ft. */
  leadFt: number;
}

function pickoffBag(base: 1 | 2) {
  return base === 1 ? FIRST : SECOND;
}

/**
 * From the first motion of the move to the ball on the bag, seconds. Null if
 * the arm cannot make it — unreachable with a roster arm, kept for the same
 * honesty `throwSecTo` has.
 */
export function pickoffThrowSec(pitcher: Character, base: 1 | 2): number | null {
  const fly = throwFlightSec(MOUND, pickoffBag(base), pitcher.stats.pitching);
  return fly === null ? null : RUN.PICKOFF_MOVE_SEC + fly;
}

/**
 * How long a runner needs back to the bag from `leadFt`: his read, the run,
 * and the dive over the last body length.
 */
export function returnSec(runner: Character, leadFt: number, readSec: number): number {
  if (leadFt <= 0) return 0;
  const speed = runner.stats.speed;
  const dive = Math.min(leadFt, RUN.DIVE_FT);
  return (
    readSec +
    sprintTimeForFt(leadFt - dive, sprintTopSpeedFts(speed), sprintAccelFtS2(speed), 0) +
    RUN.DIVE_SEC * (dive / RUN.DIVE_FT)
  );
}

/**
 * The lead a SET runner takes against this arm: the longest, up to the steal
 * lead, he returns from with `RUN.LEAD_RETURN_MARGIN_SEC` to spare. Return
 * time rises with the lead, so a bisection finds it; no draw.
 */
export function setLeadFt(runner: Character, pitcher: Character, base: 1 | 2): number {
  const throwSec = pickoffThrowSec(pitcher, base);
  if (throwSec === null) return RUN.LEAD_FT;
  const fits = (lead: number) =>
    throwSec - returnSec(runner, lead, RUN.PICKOFF_READ_SEC) >= RUN.LEAD_RETURN_MARGIN_SEC;
  if (fits(RUN.LEAD_FT)) return RUN.LEAD_FT;
  let lo = 0;
  let hi: number = RUN.LEAD_FT;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The race as it would run with a perfect read. No randomness. */
export function projectedPickoffMarginSec(spec: PickoffSpec): number {
  const throwSec = pickoffThrowSec(spec.pitcher, spec.base);
  if (throwSec === null) return Infinity;
  const leadFt = spec.leaning ? RUN.LEAD_FT : setLeadFt(spec.runner, spec.pitcher, spec.base);
  const readSec = spec.leaning ? RUN.PICKOFF_READ_LEANING_SEC : RUN.PICKOFF_READ_SEC;
  return throwSec - returnSec(spec.runner, leadFt, readSec);
}

/**
 * Run it. The read is the only randomness — the steal's `jumpSecOf`, the
 * same error in TIME — so a quick kid caught leaning can still get back and a
 * slow one on his lead can still be had.
 */
export function pickoffRace(spec: PickoffSpec, rng: Rng): PickoffResult {
  const leadFt = spec.leaning ? RUN.LEAD_FT : setLeadFt(spec.runner, spec.pitcher, spec.base);
  const projected = projectedPickoffMarginSec(spec);
  if (!Number.isFinite(projected)) return { out: false, marginSec: projected, leadFt };
  const marginSec = projected - jumpSecOf(spec.runner, rng);
  return { out: !(marginSec > 0), marginSec, leadFt };
}
