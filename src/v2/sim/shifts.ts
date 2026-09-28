// ---------------------------------------------------------------------------
// Defensive shifts (`features.shifts`, HELD — `docs/playtests/holds.json`).
// PURE, and inert with the flag off.
//
// ★ A SHIFT IS WHERE THE FIELDERS START, NOTHING ELSE. The chase, the reads,
// the throws and the one kid speed are untouched; a shifted shortstop is the
// same shortstop standing somewhere else, so the play reducer needs no new
// rule — only `beginPlay` placing him, and the frame telling the view where
// he waits between pitches.
//
// ★ THE ROTATION IS ABOUT HOME PLATE, BY A LITERAL COS/SIN PAIR. A pull shift
// swings the fielders toward the side a right-handed batter pulls to (left
// field, negative x — `contact.ts` negates spray for exactly that reason); an
// oppo shift swings them the other way. The first baseman holds for a pull
// shift and the third baseman for an oppo one, so the bag a force goes to is
// still covered. No trig is evaluated: the pair is written out, so the
// fingerprint cannot depend on an implementation-approximated `Math.cos`.
// ---------------------------------------------------------------------------

import { FIELD_POSITIONS, type PositionId, type Vec2 } from './field';
import type { Character } from '../../data/types';

export type Shift = 'normal' | 'pull' | 'oppo';

export const SHIFTS: ReadonlyArray<Shift> = Object.freeze(['normal', 'pull', 'oppo'] as const);

/** cos and sin of the shift angle, 14 degrees. Literal, never computed. */
const COS = 0.9702957262759965;
const SIN = 0.24192189559966773;

/** Who never moves: the battery, and the corner guarding the force at their bag. */
const ANCHORED: Readonly<Record<Shift, ReadonlyArray<PositionId>>> = {
  normal: ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'],
  pull: ['P', 'C', '1B'],
  oppo: ['P', 'C', '3B'],
};

/** Where `pos` starts under `shift`, ft. `normal` is the table itself. */
export function shiftedPost(pos: PositionId, shift: Shift): Vec2 {
  const at = FIELD_POSITIONS[pos];
  if (ANCHORED[shift].includes(pos)) return at;
  // Pull: rotate toward -x (left field). Oppo: toward +x.
  const s = shift === 'pull' ? -SIN : SIN;
  return { x: at.x * COS + at.z * s, z: -at.x * s + at.z * COS };
}

/**
 * The CPU's shift against a batter: pull for the sluggers, normal otherwise.
 * Keyed on the `power` stat — the kid whose bat speed makes an early swing
 * leave the park is the kid a real coach shifts on.
 */
export const CPU_PULL_SHIFT_POWER = 8;

export function cpuShift(batter: Character): Shift {
  return batter.stats.power >= CPU_PULL_SHIFT_POWER ? 'pull' : 'normal';
}
