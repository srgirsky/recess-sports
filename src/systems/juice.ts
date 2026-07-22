// ---------------------------------------------------------------------------
// The juice meter (main mode). PURE. Great plays charge it; it's spent on a
// POWER SWING at the plate or the CRAZY pitch on the mound. The 3 signature
// kids plug in via ability hooks.
// ---------------------------------------------------------------------------

import { JUICE } from '../config';
import type { AbilityId } from '../data/types';

export type JuiceEventKind = keyof typeof JUICE.GAINS;

export interface JuiceState {
  value: number;
  max: number;
}

export function newJuice(): JuiceState {
  return { value: 0, max: JUICE.MAX };
}

/** How much a play charges the meter (ability hooks may sweeten it). */
export function juiceGain(kind: JuiceEventKind, ability: AbilityId = 'none'): number {
  let gain = JUICE.GAINS[kind];
  // The contact queen charges extra off bat-on-ball plays.
  if (ability === 'never_strikes_out' && (kind === 'hit' || kind === 'perfectSwing')) {
    gain = Math.round(gain * 1.5);
  }
  return gain;
}

export function addJuice(j: JuiceState, amount: number): JuiceState {
  return { ...j, value: Math.min(j.max, j.value + amount) };
}

/**
 * Everything the meter buys. powerSwing/crazyPitch are the classics;
 * fireball/freezeball are the other two special pitches (pitchkind's
 * specialPitches, mapped via spendKindForPitch); the newer three are
 * one-play/one-inning modifiers consumed by existing systems: turboLegs (next
 * offensive live play: runner speed burst), goldenGlove (next defensive live
 * play: error-proof + stronger magnet), rallyCap (rest of the batting half:
 * wider swing windows).
 */
export type SpendKind =
  | 'powerSwing'
  | 'crazyPitch'
  | 'fireball'
  | 'freezeball'
  | 'turboLegs'
  | 'goldenGlove'
  | 'rallyCap';

/** The spend a special pitch rides on (crazy predates the naming), or
 *  undefined for the free base rotation. */
export function spendKindForPitch(kind: string): SpendKind | undefined {
  if (kind === 'crazy') return 'crazyPitch';
  if (kind === 'fireball' || kind === 'freezeball') return kind;
  return undefined;
}

/** What a spend costs — the ace's crazy pitch comes cheap. */
export function spendCost(kind: SpendKind, ability: AbilityId = 'none'): number {
  const base = JUICE.COSTS[kind];
  if (kind === 'crazyPitch' && ability === 'unhittable_pitch') return Math.round(base / 2);
  return base;
}

export function canSpend(j: JuiceState, kind: SpendKind, ability: AbilityId = 'none'): boolean {
  return j.value >= spendCost(kind, ability);
}

export function spend(j: JuiceState, kind: SpendKind, ability: AbilityId = 'none'): JuiceState {
  if (!canSpend(j, kind, ability)) return j;
  return { ...j, value: j.value - spendCost(kind, ability) };
}

/**
 * Which special pitch (if any) the CPU throws this pitch: one want-roll at
 * cpuWantsSpend's eagerness, then a uniform pick among what it can afford.
 * Zero rng draws when it's broke, one when the roll fails, two on a pick.
 */
export function cpuPickSpecialPitch(
  j: JuiceState,
  scoreDiff: number, // CPU score minus player score
  rng: () => number,
  ability: AbilityId = 'none'
): 'crazy' | 'fireball' | 'freezeball' | undefined {
  const specials = ['crazy', 'fireball', 'freezeball'] as const;
  const affordable = specials.filter((k) => canSpend(j, spendKindForPitch(k)!, ability));
  if (affordable.length === 0) return undefined;
  const eagerness = scoreDiff < 0 ? 0.6 : scoreDiff === 0 ? 0.3 : 0.12;
  if (rng() >= eagerness) return undefined;
  return affordable[Math.floor(rng() * affordable.length)];
}

/** The CPU spends when it's behind (or the game is on the line late). */
export function cpuWantsSpend(
  j: JuiceState,
  kind: SpendKind,
  scoreDiff: number, // CPU score minus player score
  rng: () => number,
  ability: AbilityId = 'none'
): boolean {
  if (!canSpend(j, kind, ability)) return false;
  const eagerness = scoreDiff < 0 ? 0.6 : scoreDiff === 0 ? 0.3 : 0.12;
  return rng() < eagerness;
}
