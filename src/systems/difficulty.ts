// ---------------------------------------------------------------------------
// CPU difficulty ramp — PURE, CLASSIC only. A returning player who has beaten
// the CPU a few times faces slightly sharper opposition: tighter CPU pitches
// (arm bonus) and a more disciplined CPU batter (contact bonus). Levels come
// from games played (picklog's tally today; the season's game index later).
// Capped low — this is a ramp, not a wall, and it NEVER applies in kid mode.
// ---------------------------------------------------------------------------

import { DIFFICULTY } from '../config';
import type { Character } from '../data/types';

/** 0 (first game) .. MAX_LEVEL, climbing PER_GAME per game played. */
export function rampLevel(gamesPlayed: number): number {
  return Math.min(DIFFICULTY.MAX_LEVEL, Math.max(0, gamesPlayed) * DIFFICULTY.PER_GAME);
}

/** The CPU pitcher's effective arm at this level (tighter scatter). */
export function rampedArm(stat: number, level: number): number {
  return Math.min(10, stat + level * DIFFICULTY.ARM_PER_LEVEL);
}

/** The CPU batter with ramped contact (chases less, punishes more). */
export function rampedCpuBatter(char: Character, level: number): Character {
  if (level <= 0) return char;
  return {
    ...char,
    stats: {
      ...char.stats,
      contact: Math.min(10, char.stats.contact + level * DIFFICULTY.CONTACT_PER_LEVEL),
    },
  };
}
