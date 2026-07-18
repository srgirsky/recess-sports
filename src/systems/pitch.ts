// ---------------------------------------------------------------------------
// Pitching resolution for the player's DEFENSE half. PURE. Mirrors atbat.ts:
//
//   TIMING is the skill  -> how close the throw was decides the pitch band.
//   STATS are the flavor -> the pitcher's stat forgives sloppy timing, then the
//                           CPU batter's contact decides how well they swing.
//
// A good pitch drags the CPU batter's swing band DOWN; a wild pitch is usually
// taken for a ball (walks live in inning.ts). Also owns the AI's occasional
// wild pitch at the player (the "don't swing!" telegraph in the batting half).
// ---------------------------------------------------------------------------

import type { Character } from '../data/types';
import type { SwingBand } from './atbat';
import { PITCH_TIMING, WILD_PITCH_CHANCE, PITCHES } from '../config';
import { distOffZone, edgeFactor, type PitchPlan } from './pitchkind';

export type PitchBand = 'perfect' | 'good' | 'weak' | 'wild';

/** Map throw-timing error (ms) to a pitch band. Same shape as bandFromError. */
export function pitchBandFromError(errorMs: number): PitchBand {
  const e = Math.abs(errorMs);
  if (e <= PITCH_TIMING.PERFECT) return 'perfect';
  if (e <= PITCH_TIMING.GOOD) return 'good';
  if (e <= PITCH_TIMING.WEAK) return 'weak';
  return 'wild';
}

const PITCH_ORDER: PitchBand[] = ['wild', 'weak', 'good', 'perfect'];

/** What the CPU batter decides to do against one pitch. */
export interface CpuPitchPlan {
  /** The pitch missed the zone — if the CPU doesn't chase, it's a ball. */
  isBall: boolean;
  /** CPU takes most balls; always offers at strikes. */
  cpuSwings: boolean;
  /** If swinging: the CPU's timing band AFTER the pitch-quality shift. */
  cpuBand: SwingBand;
  /** Short, kid-readable line for the announcer. */
  description: string;
}

/**
 * Decide what the CPU batter does against this pitch. Pure.
 * A high pitching stat forgives sloppy timing (band nudge up, like contact
 * does for batting); pitch quality then drags the CPU's swing band down.
 */
export function resolveCpuPitch(
  band: PitchBand,
  pitcher: Character,
  batter: Character,
  rng: () => number
): CpuPitchPlan {
  // --- Pitcher stat forgives sloppy timing: 8+ arm nudges the band up one ---
  if (pitcher.stats.pitching >= 8 && band !== 'perfect' && rng() < 0.35) {
    band = PITCH_ORDER[PITCH_ORDER.indexOf(band) + 1];
  }

  // --- Is it in the zone? Perfect never misses; wild almost always does -----
  const ballChance: Record<PitchBand, number> = {
    perfect: 0,
    good: 0.1,
    weak: 0.45,
    wild: 0.85,
  };
  const isBall = rng() < ballChance[band];

  if (isBall) {
    // CPU chases a bad ball once in a while — and swings badly when it does.
    const chases = rng() < 0.2;
    if (!chases) {
      return { isBall, cpuSwings: false, cpuBand: 'miss', description: 'Ball!' };
    }
    const cpuBand: SwingBand = rng() < 0.5 ? 'weak' : 'miss';
    return { isBall, cpuSwings: true, cpuBand, description: 'Chased a bad one!' };
  }

  // --- In the zone: CPU swings, quality from contact then shifted by pitch --
  let cpuBand = cpuSwingBand(batter.stats.contact, rng);
  if (band === 'perfect') cpuBand = downgradeSwing(cpuBand);
  if (band === 'wild') cpuBand = upgradeCapped(cpuBand); // a hanger right in the zone

  return { isBall, cpuSwings: true, cpuBand, description: 'Swings…' };
}

/**
 * Location-aware CPU batter decision (main mode). Ball/strike comes from the
 * pitch's ACTUAL crossing point, not a band roll: off the zone the CPU mostly
 * takes (deception tempts a bad chase); in the zone it swings, with quality
 * dragged down by good meter timing, painted corners, and deceptive pitches.
 */
export function resolveCpuPitchLocated(
  plan: PitchPlan,
  band: PitchBand,
  batter: Character,
  rng: () => number
): CpuPitchPlan {
  const def = PITCHES[plan.kind];

  if (!plan.inZone) {
    const off = distOffZone(plan.actual);
    const chaseChance = Math.min(0.5, Math.max(0.05, 0.15 + def.deception * 0.35 - off * 0.004));
    if (rng() >= chaseChance) {
      return { isBall: true, cpuSwings: false, cpuBand: 'miss', description: 'Ball!' };
    }
    const cpuBand: SwingBand = rng() < 0.5 ? 'weak' : 'miss';
    return { isBall: true, cpuSwings: true, cpuBand, description: 'Chased a bad one!' };
  }

  let cpuBand = cpuSwingBand(batter.stats.contact, rng);
  if (band === 'perfect') cpuBand = downgradeSwing(cpuBand);
  if (band === 'wild') cpuBand = upgradeCapped(cpuBand); // blew the meter but it found the zone: a hanger
  if (rng() < edgeFactor(plan.actual) * 0.4) cpuBand = downgradeSwing(cpuBand); // painted the corner
  if (rng() < def.deception * 0.3) cpuBand = downgradeSwing(cpuBand); // fooled by the pitch

  return { isBall: false, cpuSwings: true, cpuBand, description: 'Swings…' };
}

/** Chance the AI pitcher throws a visibly wild one at the player. */
export function rollAiWildPitch(pitcher: Character, rng: () => number): boolean {
  const chance =
    WILD_PITCH_CHANCE.BASE - (pitcher.stats.pitching - 5) * WILD_PITCH_CHANCE.PER_PITCHING;
  return rng() < Math.max(0.04, chance);
}

/** Player swings at a wild pitch: cap the band (perfect/good -> weak, else miss). */
export function wildSwingBand(band: SwingBand): SwingBand {
  return band === 'perfect' || band === 'good' ? 'weak' : 'miss';
}

/** CPU swing quality, weighted by the batter's contact stat (was GameScene's autoBand). */
export function cpuSwingBand(contact: number, rng: () => number): SwingBand {
  const r = rng() + (contact - 5) * 0.035;
  if (r > 0.86) return 'perfect';
  if (r > 0.58) return 'good';
  if (r > 0.3) return 'weak';
  return 'miss';
}

const SWING_ORDER: SwingBand[] = ['miss', 'weak', 'good', 'perfect'];

function downgradeSwing(band: SwingBand): SwingBand {
  return SWING_ORDER[Math.max(0, SWING_ORDER.indexOf(band) - 1)];
}

function upgradeCapped(band: SwingBand): SwingBand {
  return SWING_ORDER[Math.min(SWING_ORDER.length - 1, SWING_ORDER.indexOf(band) + 1)];
}
