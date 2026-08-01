// ---------------------------------------------------------------------------
// Baserunning. PURE.
//
// ★ A RUNNER IS THE SAME KID AS A FIELDER, and this file proves it by not
// containing a speed. `sprintTopSpeedFts` and `sprintAccelFtS2` are the same two
// functions `fielders.ts` calls, and `purity.lint.test.js` fails any file in the
// sim that names a kid speed of its own. `defense.fielderSpeed` is the record of
// what the alternative costs: v1's `FIELDER_SPEED` sat at 210 px/s through five
// consecutive runner slowdowns, drifting to 2.48x runner speed one retune at a
// time, and the fix then scaled BOTH by 1/1.987 and preserved the ratio exactly.
//
// ★ AND A RUNNER ACCELERATES. v1's runners are PROGRESS-parameterised — a leg is
// `dist/speed` milliseconds long and `progress` walks linearly from 0 to 1 — so
// a batter is at full sprint on the frame of contact. `pace.homeToFirst` then
// measures 4200ms and v1 divides to get one flat speed, which is too fast out of
// the box and too slow at the bag. Here the measurement determines the RAMP
// instead (see `athletes.ts`), and the 4200ms leg is a consequence of the model
// rather than its definition. A test asserts the integrator reproduces it.
//
// ★ TWO v1 BUGS ARE PINNED HERE BEFORE THEY CAN HAPPEN AGAIN. Both are recorded
// in `defense.fielderSpeed.exposed` as things SLOWER FIELDERS SURFACED — they
// were always there, and faster fielders ended plays before they could be
// reached. They are the two guards in `reverseLeg` and `settleBase` below.
// ---------------------------------------------------------------------------

import type { Character } from '../../data/types';
import { RUN } from './params';
import { basePos, dist, lerpVec, type Vec2 } from './field';
import { sprintAccelFtS2, sprintTopSpeedFts } from './athletes';

/**
 * 0 is the batter's box, 4 is home plate scored. They are the SAME POINT and
 * that ambiguity is load-bearing in both directions — see `settleBase`.
 */
export type Base = 0 | 1 | 2 | 3 | 4;

export interface RunnerState {
  charId: string;
  /** Where they stood when the play began. A foul sends everyone back to it. */
  startBase: Base;
  /** The bag behind them. Equals `to` when they are standing on it. */
  from: Base;
  /** Where they are running. Equals `from` when settled. */
  to: Base;
  /** Feet covered along the current leg. */
  alongFt: number;
  /** The leg's length, ft. */
  legFt: number;
  /** Current speed, ft/s. Zero at a standing start. */
  speedFts: number;
  topFts: number;
  accelFtS2: number;
  /** Sim seconds they last touched a bag. */
  touchedAtSec: number;
  /** Sim seconds they last turned around. */
  reversedAtSec: number;
  done: null | 'out' | 'scored';
}

export function makeRunner(char: Character, at: Base, nowSec = 0): RunnerState {
  return {
    charId: char.id,
    startBase: at,
    from: at,
    to: at,
    alongFt: 0,
    legFt: 0,
    speedFts: 0,
    topFts: sprintTopSpeedFts(char.stats.speed),
    accelFtS2: sprintAccelFtS2(char.stats.speed),
    touchedAtSec: nowSec,
    reversedAtSec: -Infinity,
    done: null,
  };
}

/** Where they are on the field, ft. */
export function runnerPos(r: RunnerState): Vec2 {
  if (r.to === r.from || r.legFt <= 0) return { ...basePos(r.from) };
  return lerpVec(basePos(r.from), basePos(r.to), r.alongFt / r.legFt);
}

/** How far they still have to go, ft. */
export function remainingFt(r: RunnerState): number {
  if (r.to === r.from) return 0;
  const left = r.legFt - r.alongFt;
  return left > 0 ? left : 0;
}

/** True while they are standing on a bag. */
export function isSettled(r: RunnerState): boolean {
  return r.to === r.from;
}

/**
 * Send them to `to`.
 *
 * ★ MOMENTUM IS KEPT ON PURPOSE. A runner who touches first and keeps going does
 * not stop and restart, so `speedFts` carries across; a runner who stands on the
 * bag has already been decelerated to zero by `stepRunner`. v1 has neither
 * behaviour because it has no speed state at all — every leg there starts and
 * ends at the same flat pace.
 */
export function startLeg(r: RunnerState, to: Base): boolean {
  if (r.done !== null || to === r.from) return false;
  r.to = to;
  r.alongFt = 0;
  r.legFt = dist(basePos(r.from), basePos(to));
  return r.legFt > 0;
}

export type RunnerStep = 'idle' | 'running' | 'arrived';

/**
 * Advance one runner by `dtSec`.
 *
 * ★ THE ARRIVAL TICK IS WHAT MAKES "KEEP THE MOMENTUM" SAFE. `stepRunner`
 * returns `'arrived'` with the speed still on the runner, so a policy that sends
 * them onward in the same tick gets a kid who never stopped. If nothing sends
 * them, the NEXT step finds them settled and puts the speed at zero: they pulled
 * up on the bag, and a kid standing on a bag is standing still. There is no
 * coasting state, because there is nowhere for a settled runner to coast to.
 */
export function stepRunner(r: RunnerState, dtSec: number, nowSec: number): RunnerStep {
  if (r.done !== null) return 'idle';
  if (isSettled(r)) {
    r.speedFts = 0;
    return 'idle';
  }

  const top = r.topFts;
  const next = r.speedFts + r.accelFtS2 * dtSec;
  r.speedFts = next > top ? top : next;
  r.alongFt += r.speedFts * dtSec;
  if (r.alongFt < r.legFt) return 'running';

  // Touched it. `from` becomes the bag; `to` collapses onto it, so the runner is
  // settled until a policy sends them again.
  r.alongFt = 0;
  r.from = r.to;
  r.legFt = 0;
  r.touchedAtSec = nowSec;
  if (r.from >= 4) r.done = 'scored';
  return 'arrived';
}

/**
 * Turn a mid-leg runner around: same leg, opposite direction.
 *
 * ★ THE `from <= 0` GUARD IS BUG ONE. A BATTER-RUNNER can never go back to the
 * plate. Without the guard a rundown rule turns the batter toward home, and
 * because a batter at base 0 is FORCED they get re-sent to first the instant
 * they touch it — a flip-flop, plus a runner who can end the play at base 0 and
 * vanish from the inning entirely. `startRetreatLeg` carries the same guard for
 * the same reason, which is why they are written next to each other.
 *
 * ★ AND A REVERSAL COSTS THE SPEED. You have to stop to turn around. v1 flips
 * `progress` and keeps running at the same pace, because it has no speed to
 * lose; here the kid restarts from a dead stop, which is what makes a rundown
 * cost something.
 */
export function reverseLeg(r: RunnerState, nowSec: number): boolean {
  if (r.done !== null || r.to === r.from || r.from <= 0) return false;
  const was = r.from;
  r.from = r.to;
  r.to = was;
  r.alongFt = r.legFt - r.alongFt;
  r.speedFts = 0;
  r.reversedAtSec = nowSec;
  return true;
}

/** A settled runner steps back one base (a tag-up retreat, or a manual hold). */
export function startRetreatLeg(r: RunnerState): boolean {
  if (r.done !== null || !isSettled(r) || r.from <= 0) return false;
  return startLeg(r, (r.from - 1) as Base);
}

/**
 * Where a runner still on the move settles when the play is called dead.
 *
 * ★ THIS IS BUG TWO, AND IT IS ONE LINE. "Behind them" is `min(from, to)`, NOT
 * `from`: `reverseLeg` SWAPS the pair, so a runner turned back from the plate
 * carries `from === 4` while running toward third, having never touched home.
 * Settling them on `from` put a live runner on base 4 — no run scored, and the
 * fold back into the inning writes `bases[3]` on a three-element tuple, so the
 * runner silently vanished. Both clamps are the same rule at the two ends: a
 * batter-runner has nothing behind them (and a whole play went by without the
 * defence retiring them, so they reached), and nobody may settle ON home without
 * the run being scored.
 *
 * v1 found this stochastically, via a random send/hold property test, only after
 * slowing its fielders down made long plays common. It is deterministic here.
 */
export function settleBase(r: RunnerState): Base {
  const behind = Math.min(r.from, r.to);
  return (behind < 1 ? 1 : behind > 3 ? 3 : behind) as Base;
}

/** Park a straggler on the base behind them and stop the clock on them. */
export function settleRunner(r: RunnerState): void {
  if (r.done !== null) return;
  const at = settleBase(r);
  r.from = at;
  r.to = at;
  r.alongFt = 0;
  r.legFt = 0;
  r.speedFts = 0;
}

/** May a policy send this runner yet? v1's `RUN2.BASE_DWELL_MS`. */
export function mayBeSent(r: RunnerState, nowSec: number): boolean {
  return isSettled(r) && r.done === null && nowSec - r.touchedAtSec >= RUN.BASE_DWELL_SEC;
}

/** May this runner be turned around again yet? v1's `REVERSE_COOLDOWN_MS`. */
export function mayReverse(r: RunnerState, nowSec: number): boolean {
  return nowSec - r.reversedAtSec >= RUN.REVERSE_COOLDOWN_SEC;
}
