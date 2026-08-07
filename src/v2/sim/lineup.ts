// ---------------------------------------------------------------------------
// Who plays where, and who bats when. PURE.
//
// ★ WHY v2 NEEDS ITS OWN, and it is not tidiness. `systems/lineup.ts`'s
// `autoAssign` scores shortstop on `fielding*2 + speed` and CENTRE FIELD on
// `fielding + speed*2` — it puts the best arm on the mound and then never looks
// at `pitching` again. That was harmless in v1, where every throw was 9.65x
// runner speed and the catch radius was 11.4ft, so arm strength bound nothing.
//
// PR 6 measured what it costs once throws are real: `sim.gapBallOutcome`'s
// `theArmAtShort` records a shortstop with a 34mph arm (max range 77ft) fielding
// a routine grounder at 72ft and failing to beat the runner across, while the
// same ball to the second-base side — a 40ft throw — is an out. The record says
// "NOT FIXED HERE: autoAssign is v1 code and v1 must stay byte-identical; v2's
// own lineup planner is PR 7's." This is it.
//
// ★ THE ARM WEIGHT IS DERIVED FROM THE FIELD, NOT ASSERTED. Each position's
// demand is the distance from its post to the bag it actually throws to, out of
// `FIELD_POSITIONS` — so if the field changes, the lineup follows. Nobody has to
// remember that left field needs an arm.
// ---------------------------------------------------------------------------

import type { Character } from '../../data/types';
import { FIELD_POSITIONS, FIRST, SECOND, dist, type PositionId } from './field';

export interface DefencePlan {
  /** Batting order, nine ids. */
  order: string[];
  positions: Record<string, PositionId>;
  pitcherId: string;
}

const POSITIONS: PositionId[] = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];

/**
 * The throw this position has to make, ft.
 *
 * Infielders throw to first; outfielders and the catcher throw to second (the
 * catcher's is the steal, the outfielders' is the cutoff-or-bag). Measured off
 * `FIELD_POSITIONS`, so the demand is a fact about the park.
 */
export function throwDemandFt(pos: PositionId): number {
  const post = FIELD_POSITIONS[pos];
  if (pos === 'LF' || pos === 'CF' || pos === 'RF' || pos === 'C') return dist(post, SECOND);
  return dist(post, FIRST);
}

/** How much the ball comes to this position. v1's up-the-middle priority. */
const TRAFFIC: Record<PositionId, number> = {
  P: 0.6,
  C: 0.5,
  '1B': 0.7,
  '2B': 1.0,
  SS: 1.0,
  '3B': 0.8,
  LF: 0.7,
  CF: 0.9,
  RF: 0.7,
};

/** Ground this position has to cover. Outfielders and the middle infield most. */
const RANGE: Record<PositionId, number> = {
  P: 0.2,
  C: 0.2,
  '1B': 0.3,
  '2B': 0.8,
  SS: 0.9,
  '3B': 0.5,
  LF: 1.0,
  CF: 1.0,
  RF: 1.0,
};

/**
 * Assign nine kids to nine posts, and set a batting order.
 *
 * The mound first — a pitcher is a different job, and the game is unplayable
 * without the best arm on it — then greedy over the remaining posts in order of
 * how much arm they demand, which is what `autoAssign` never asks.
 */
export function planDefence(
  ids: readonly string[],
  lookup: (id: string) => Character,
  chosenOrder?: readonly string[]
): DefencePlan {
  const kids = ids.map(lookup);
  if (kids.length < POSITIONS.length) {
    throw new RangeError(`planDefence needs ${POSITIONS.length} kids, got ${kids.length}`);
  }

  const pitcher = kids.reduce((a, b) => (b.stats.pitching > a.stats.pitching ? b : a));
  const positions: Record<string, PositionId> = { [pitcher.id]: 'P' };
  const left = new Set(kids.filter((k) => k.id !== pitcher.id).map((k) => k.id));

  // Longest throw first, so the strongest remaining arm lands where it matters.
  const rest = POSITIONS.filter((p) => p !== 'P').sort((a, b) => throwDemandFt(b) - throwDemandFt(a));
  const maxDemand = Math.max(...rest.map(throwDemandFt));

  for (const pos of rest) {
    // The arm weight IS the throw demand, normalised. Nothing states that left
    // field needs an arm; the field says so.
    const armW = throwDemandFt(pos) / maxDemand;
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const id of left) {
      const s = lookup(id).stats;
      const score = armW * 2 * s.pitching + TRAFFIC[pos] * s.fielding + RANGE[pos] * s.speed;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    positions[best!] = pos;
    left.delete(best!);
  }

  let order = battingOrder(ids, lookup);
  if (chosenOrder) {
    const roster = new Set(ids);
    const picked = new Set(chosenOrder);
    if (chosenOrder.length !== ids.length || picked.size !== ids.length || [...picked].some((id) => !roster.has(id))) {
      throw new RangeError('chosen batting order must contain every roster id exactly once');
    }
    order = [...chosenOrder];
  }
  return { order, positions, pitcherId: pitcher.id };
}

/**
 * Bat them 1-9.
 *
 * v1's shape, and its reasoning holds: table-setters who get on base first, the
 * bats in the middle, the rest after. `contact` gets on base and `power` drives
 * them in, which is the only thing the two stats are for.
 */
export function battingOrder(ids: readonly string[], lookup: (id: string) => Character): string[] {
  const kids = ids.map(lookup);
  const bySetup = [...kids].sort(
    (a, b) => b.stats.contact * 2 + b.stats.speed - (a.stats.contact * 2 + a.stats.speed)
  );
  const setters = bySetup.slice(0, 2);
  const rest = bySetup.slice(2).sort((a, b) => b.stats.power - a.stats.power);
  return [...setters, ...rest].map((k) => k.id);
}
