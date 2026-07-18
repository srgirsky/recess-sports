// ---------------------------------------------------------------------------
// Steals (main mode). PURE. One roll decides the race: the runner's speed vs
// the catcher's arm, with a better jump off slow stuff (changeup/curve) and a
// bonus when the defending player reacts fast to the throw-down prompt.
// ---------------------------------------------------------------------------

import type { PitchKind } from '../config';

export interface StealSpec {
  /** The runner's speed stat (1-10). */
  runnerSpeed: number;
  /** The catcher's arm — their pitching stat (1-10). */
  catcherArm: number;
  /** What was thrown (null when unknown): slow breakers give a better jump. */
  pitchKind: PitchKind | null;
  /** 0-3: how sharply the defense reacted to the throw-down prompt. */
  reactBonus?: number;
}

/** True = the runner made it. */
export function rollSteal(spec: StealSpec, rng: () => number): boolean {
  const slowStuff = spec.pitchKind === 'changeup' || spec.pitchKind === 'curve' ? 0.12 : 0;
  const p =
    0.5 +
    (spec.runnerSpeed - 5) * 0.05 -
    (spec.catcherArm - 5) * 0.05 -
    (spec.reactBonus ?? 0) * 0.06 +
    slowStuff;
  return rng() < Math.min(0.92, Math.max(0.08, p));
}

/** Should the CPU try a steal this pitch? Speedsters go, slowpokes don't. */
export function cpuWantsSteal(runnerSpeed: number, rng: () => number): boolean {
  return rng() < 0.1 + Math.max(0, runnerSpeed - 5) * 0.035;
}
