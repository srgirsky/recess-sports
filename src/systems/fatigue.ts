// ---------------------------------------------------------------------------
// Pitcher fatigue — PURE. Every pitch drains a little stamina; a tired arm
// loses effective pitching stat (wider scatter via pitchkind's stat term),
// which is exactly how the CPU batter starts punishing hangers. The visible
// tell (sweat, wobble) and the relief UI live in the scene; the CPU relieves
// itself on a threshold. CLASSIC only (`features.fatigue`).
// ---------------------------------------------------------------------------

import { FATIGUE } from '../config';
import type { PitchKind } from '../config';

export interface FatigueState {
  /** 1 = fresh, 0 = running on fumes. */
  stamina: number;
}

export function newFatigue(): FatigueState {
  return { stamina: 1 };
}

/** One pitch thrown. The juice specials all cost real gas. */
export function drainPitch(f: FatigueState, kind: PitchKind | null): FatigueState {
  const special = kind === 'crazy' || kind === 'fireball' || kind === 'freezeball';
  const cost = special ? FATIGUE.DRAIN_CRAZY : FATIGUE.DRAIN_PITCH;
  return { stamina: Math.max(0, f.stamina - cost) };
}

/**
 * The stat a tired arm actually throws with. Full stamina = full stat; below
 * TIRED_AT the stat sags linearly toward (stat − MAX_STAT_LOSS), floored at 1.
 */
export function effectivePitching(stat: number, f: FatigueState): number {
  const t = Math.min(1, f.stamina / FATIGUE.TIRED_AT);
  return Math.max(1, stat - (1 - t) * FATIGUE.MAX_STAT_LOSS);
}

/** Sweat-and-wobble territory — time to think about the bullpen. */
export function isTired(f: FatigueState): boolean {
  return f.stamina < FATIGUE.TIRED_AT;
}

/** The CPU pulls its own pitcher here. */
export function cpuWantsRelief(f: FatigueState): boolean {
  return f.stamina <= FATIGUE.CPU_RELIEF_AT;
}
