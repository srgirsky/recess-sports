// ---------------------------------------------------------------------------
// Steals (main mode). PURE. One roll decides the race: the runner's speed vs
// the catcher's arm, with a better jump off slow stuff (changeup/curve) and a
// bonus when the defending player reacts fast to the throw-down prompt.
// ---------------------------------------------------------------------------

import { PICKOFF, type PitchKind } from '../config';
import type { HalfInningState } from './inning';

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

/** A throw over to a base to catch the runner leaning (BB2001's pickoff). */
export interface PickoffSpec {
  /** The runner's speed stat (1-10): quick kids dive back in time. */
  runnerSpeed: number;
  /** The pitcher's arm — their pitching stat (1-10). */
  pitcherArm: number;
  /** Was the runner about to go (the CPU had decided to steal this pitch)? */
  leaning: boolean;
}

/**
 * True = picked off. Reading the runner is the whole skill: one caught
 * leaning is usually out; one standing on the bag almost never is, so
 * throwing over blindly is a wasted beat, not a free out.
 */
export function rollPickoff(spec: PickoffSpec, rng: () => number): boolean {
  const base = spec.leaning ? PICKOFF.LEANING : PICKOFF.HOME;
  const p = base + (spec.pitcherArm - 5) * 0.03 - (spec.runnerSpeed - 5) * 0.03;
  return rng() < Math.min(0.85, Math.max(0.02, p));
}

/**
 * Fold a pickoff into the half inning: an out removes the runner from that
 * base and adds an out; a safe throw changes nothing. Count and batter are
 * untouched either way (a throw over is not a pitch).
 */
export function applyPickoff(prev: HalfInningState, base: 1 | 2 | 3, out: boolean): HalfInningState {
  if (!out || !prev.bases[base - 1]) return prev;
  const bases = [...prev.bases] as [boolean, boolean, boolean];
  bases[base - 1] = false;
  return { ...prev, bases, outs: prev.outs + 1 };
}
