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

/** What a spend costs — the ace's crazy pitch comes cheap. */
export function spendCost(kind: 'powerSwing' | 'crazyPitch', ability: AbilityId = 'none'): number {
  const base = kind === 'powerSwing' ? JUICE.POWER_SWING_COST : JUICE.CRAZY_PITCH_COST;
  if (kind === 'crazyPitch' && ability === 'unhittable_pitch') return Math.round(base / 2);
  return base;
}

export function canSpend(j: JuiceState, kind: 'powerSwing' | 'crazyPitch', ability: AbilityId = 'none'): boolean {
  return j.value >= spendCost(kind, ability);
}

export function spend(j: JuiceState, kind: 'powerSwing' | 'crazyPitch', ability: AbilityId = 'none'): JuiceState {
  if (!canSpend(j, kind, ability)) return j;
  return { ...j, value: j.value - spendCost(kind, ability) };
}

/** The CPU spends when it's behind (or the game is on the line late). */
export function cpuWantsSpend(
  j: JuiceState,
  kind: 'powerSwing' | 'crazyPitch',
  scoreDiff: number, // CPU score minus player score
  rng: () => number,
  ability: AbilityId = 'none'
): boolean {
  if (!canSpend(j, kind, ability)) return false;
  const eagerness = scoreDiff < 0 ? 0.6 : scoreDiff === 0 ? 0.3 : 0.12;
  return rng() < eagerness;
}
