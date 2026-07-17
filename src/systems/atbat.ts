// ---------------------------------------------------------------------------
// At-bat resolution. PURE. Two ideas kept separate on purpose:
//
//   TIMING is the skill  -> how close the swing was decides the "band".
//   STATS are the flavor -> within a band, the kid's stats decide the outcome.
//
// So a max-contact kid forgives sloppy timing; a slugger turns good timing into
// home runs. Ability hooks (never_strikes_out, unhittable_pitch) also apply here.
// ---------------------------------------------------------------------------

import type { Character } from '../data/types';
import { TIMING } from '../config';

export type SwingBand = 'perfect' | 'good' | 'weak' | 'miss';

export type AtBatKind = 'hit' | 'out' | 'strike' | 'foul';

export interface AtBatResult {
  kind: AtBatKind;
  /** Bases the batter takes on a hit: 1=single .. 4=home run. 0 otherwise. */
  bases: number;
  /** Short, kid-readable line for the announcer / speech bubble. */
  description: string;
}

/** Map swing-timing error (ms) to a band. A late/no swing is handled by the caller. */
export function bandFromError(errorMs: number): SwingBand {
  const e = Math.abs(errorMs);
  if (e <= TIMING.PERFECT) return 'perfect';
  if (e <= TIMING.GOOD) return 'good';
  if (e <= TIMING.CONTACT) return 'weak';
  return 'miss';
}

const BAND_ORDER: SwingBand[] = ['miss', 'weak', 'good', 'perfect'];

/** Shift a band down one step (used by unhittable_pitch). */
function downgrade(band: SwingBand): SwingBand {
  const i = BAND_ORDER.indexOf(band);
  return BAND_ORDER[Math.max(0, i - 1)];
}

/**
 * Resolve a swing into an outcome.
 * @param band   the timing band from bandFromError
 * @param batter the kid at the plate
 * @param pitcher the kid on the mound
 * @param rng    () => 0..1
 */
export function resolveSwing(
  band: SwingBand,
  batter: Character,
  pitcher: Character,
  rng: () => number
): AtBatResult {
  // --- Pitcher ability: nearly unhittable heat drags the band down a notch ---
  if (pitcher.ability === 'unhittable_pitch') {
    band = downgrade(band);
  }

  // --- Batter ability: this kid literally never whiffs ---------------------
  if (batter.ability === 'never_strikes_out' && band === 'miss') {
    band = 'weak';
  }

  const { contact, power, speed } = batter.stats;

  if (band === 'miss') {
    return { kind: 'strike', bases: 0, description: 'Swing and a miss!' };
  }

  // Probability of making a hit (vs. an out) within this band, nudged by contact.
  const baseHitChance: Record<Exclude<SwingBand, 'miss'>, number> = {
    weak: 0.18,
    good: 0.62,
    perfect: 0.9,
  };
  const contactBonus = (contact - 5) * 0.03; // +/-15% across the stat range
  const hitChance = clamp(baseHitChance[band] + contactBonus, 0.05, 0.98);

  // Weak contact has a small chance to be fouled off (a strike that can't be #3).
  if (band === 'weak' && rng() < 0.25) {
    return { kind: 'foul', bases: 0, description: 'Ticked it foul.' };
  }

  if (rng() > hitChance) {
    // An out — but a speedy kid sometimes beats out a weak grounder.
    if (band === 'weak' && rng() < speed * 0.03) {
      return { kind: 'hit', bases: 1, description: 'Beats the throw! Infield single!' };
    }
    return { kind: 'out', bases: 0, description: outFlavor(band, rng) };
  }

  // It's a hit — decide how many bases from the band + power (+ a little speed).
  const bases = hitBases(band, power, speed, rng);
  return { kind: 'hit', bases, description: hitFlavor(bases) };
}

function hitBases(
  band: SwingBand,
  power: number,
  speed: number,
  rng: () => number
): number {
  // Roll a "quality" score; higher band + power push toward extra bases.
  const bandBoost = band === 'perfect' ? 0.35 : band === 'good' ? 0.12 : 0;
  const q = rng() + bandBoost + (power - 5) * 0.04 + (speed - 5) * 0.015;
  if (q > 1.15) return 4; // home run
  if (q > 0.92) return 3; // triple
  if (q > 0.68) return 2; // double
  return 1; // single
}

function hitFlavor(bases: number): string {
  switch (bases) {
    case 4:
      return 'HOME RUN! 💥';
    case 3:
      return 'Triple! All the way to third!';
    case 2:
      return 'Double! Stand-up double!';
    default:
      return 'Base hit!';
  }
}

function outFlavor(band: SwingBand, rng: () => number): string {
  const pool =
    band === 'perfect' || band === 'good'
      ? ['Lined right at someone!', 'Great catch robs the hit!', 'Caught at the wall!']
      : ['Grounds out.', 'Pops it up — caught.', 'Easy out.'];
  return pool[Math.floor(rng() * pool.length)];
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
